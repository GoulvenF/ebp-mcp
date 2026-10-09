import { randomBytes } from "node:crypto";
import { basename, join } from "node:path";
import {
  depuisErreurFichier,
  erreurEnveloppeInvalide,
  erreurVersionPlusRecente,
} from "./errors.js";
import { repertoireParent, type OperationsFichier } from "./operations-fichier.js";

/** Version actuelle de l'enveloppe de stockage (décision 5, fiche T04). */
export const STORE_VERSION_ACTUELLE = 1;

interface Enveloppe {
  readonly storeVersion: number;
  readonly type: string;
  readonly data: unknown;
}

/**
 * Store JSON atomique (décision 4/5, fiche T04) : un lecteur ne voit jamais un fichier à moitié
 * écrit. `lire`/`ecrire` sont les seules opérations exposées ; toute logique de verrouillage
 * interprocessus vit dans `verrou.ts`/`transaction.ts`.
 */
export interface StoreJson {
  lire<T>(chemin: string, type: string): Promise<T | null>;
  ecrire<T>(chemin: string, type: string, valeur: T): Promise<void>;
}

/** Même forme que `Journal` de `src/config/` ; non importée pour respecter le sens des dépendances. */
export interface JournalStockage {
  avertir(message: string): void;
}

export interface DependancesStoreJson {
  readonly operations: OperationsFichier;
  readonly journal?: JournalStockage;
}

function nomTemporaire(base: string): string {
  const alea = randomBytes(8).toString("hex");
  return `.tmp-${base}-${process.pid}-${alea}`;
}

function regexTemporaire(base: string): RegExp {
  const baseEchappee = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^\\.tmp-${baseEchappee}-(\\d+)-[0-9a-f]+$`);
}

function pidVivant(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (erreur) {
    return (erreur as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

/** Nettoyage borné des temporaires orphelins de ce store, sans jamais toucher un pid vivant. */
async function nettoyerOrphelins(
  operations: OperationsFichier,
  dir: string,
  base: string,
  journal: JournalStockage | undefined,
): Promise<void> {
  let entrees: string[];
  try {
    entrees = await operations.listerRepertoire(dir);
  } catch {
    return;
  }
  const motif = regexTemporaire(base);
  for (const entree of entrees) {
    const correspondance = motif.exec(entree);
    if (correspondance === null) continue;
    const pid = Number.parseInt(correspondance[1] as string, 10);
    if (!Number.isInteger(pid) || pidVivant(pid)) continue;
    try {
      await operations.supprimer(join(dir, entree));
    } catch (erreur) {
      if ((erreur as NodeJS.ErrnoException).code !== "ENOENT") {
        journal?.avertir(`Nettoyage d'un temporaire orphelin échoué : ${entree}.`);
      }
    }
  }
}

function analyserEnveloppe(chemin: string, type: string, contenu: string): unknown {
  let brut: unknown;
  try {
    brut = JSON.parse(contenu);
  } catch {
    throw erreurEnveloppeInvalide(chemin, "json_invalide");
  }
  if (typeof brut !== "object" || brut === null || Array.isArray(brut)) {
    throw erreurEnveloppeInvalide(chemin, "enveloppe_invalide");
  }
  const enveloppe = brut as Partial<Enveloppe>;
  if (typeof enveloppe.storeVersion !== "number" || !Number.isInteger(enveloppe.storeVersion)) {
    throw erreurEnveloppeInvalide(chemin, "storeVersion_absente");
  }
  if (enveloppe.storeVersion > STORE_VERSION_ACTUELLE) {
    throw erreurVersionPlusRecente(chemin, enveloppe.storeVersion);
  }
  if (enveloppe.storeVersion !== STORE_VERSION_ACTUELLE) {
    throw erreurEnveloppeInvalide(chemin, "storeVersion_inconnue");
  }
  if (enveloppe.type !== type) {
    throw erreurEnveloppeInvalide(chemin, "type_inattendu");
  }
  if (!("data" in enveloppe)) {
    throw erreurEnveloppeInvalide(chemin, "data_absente");
  }
  return enveloppe.data;
}

export function creerStoreJson(deps: DependancesStoreJson): StoreJson {
  const { operations, journal } = deps;

  return {
    async lire<T>(chemin: string, type: string): Promise<T | null> {
      let contenu: string;
      try {
        contenu = await operations.lireFichier(chemin);
      } catch (erreur) {
        if ((erreur as NodeJS.ErrnoException).code === "ENOENT") {
          return null;
        }
        throw depuisErreurFichier(erreur, chemin);
      }
      return analyserEnveloppe(chemin, type, contenu) as T;
    },

    async ecrire<T>(chemin: string, type: string, valeur: T): Promise<void> {
      const dir = repertoireParent(chemin);
      const base = basename(chemin);
      try {
        await operations.creerRepertoire(dir, 0o700);
        await operations.definirPermissions(dir, 0o700);
      } catch (erreur) {
        throw depuisErreurFichier(erreur, chemin);
      }
      await nettoyerOrphelins(operations, dir, base, journal);

      const temp = join(dir, nomTemporaire(base));
      const contenu = JSON.stringify({ storeVersion: STORE_VERSION_ACTUELLE, type, data: valeur } satisfies Enveloppe);

      let descripteur;
      try {
        descripteur = await operations.ouvrirExclusif(temp, 0o600);
      } catch (erreur) {
        throw depuisErreurFichier(erreur, chemin);
      }

      try {
        try {
          await operations.ecrireTout(descripteur, contenu);
          await operations.synchroniser(descripteur);
        } catch (erreurEcriture) {
          await operations.fermer(descripteur).catch(() => undefined);
          throw erreurEcriture;
        }
        await operations.fermer(descripteur);
      } catch (erreur) {
        await operations.supprimer(temp).catch(() => undefined);
        throw depuisErreurFichier(erreur, chemin);
      }

      try {
        await operations.renommer(temp, chemin);
      } catch (erreur) {
        await operations.supprimer(temp).catch(() => undefined);
        throw depuisErreurFichier(erreur, chemin);
      }

      try {
        await operations.synchroniserRepertoire(dir);
      } catch {
        // Meilleur effort (décision 4, fiche T04) : un fsync de répertoire impossible (Windows,
        // ou tout autre échec) n'invalide pas une écriture déjà renommée sur disque.
      }
    },
  };
}
