import { randomBytes } from "node:crypto";
import { basename, join } from "node:path";
import { z } from "zod";
import type { Environnement } from "../domain/capabilities.js";
import type { LockManager } from "../ports/lock-manager.js";
import { depuisErreurFichier } from "../storage/errors.js";
import { repertoireParent, type OperationsFichier } from "../storage/operations-fichier.js";
import { erreurConfigInvalide } from "./errors.js";
import type { Identifiant } from "./identifiers.js";
import type { ProfilBrut } from "./schema.js";
import { schemaFichierConfig, type FichierConfig } from "./schema.js";

/** Nom de verrou unique pour `config.json` (07 §2) : un seul fichier par racine de configuration. */
export const NOM_VERROU_CONFIG = "config";

export interface DependancesEcritureConfig {
  readonly verrous: LockManager;
  readonly operations: OperationsFichier;
  readonly chemin: string;
  readonly deadline: Date;
  readonly signal?: AbortSignal;
}

/**
 * Transformation pure (aucune IO, aucun appel réseau) appliquée sous verrou à la configuration
 * **relue** depuis le disque (décision D-T13-2) : reçoit le fichier déjà validé par
 * `schemaFichierConfig`, renvoie un nouveau fichier qui sera revalidé avant écriture.
 */
export type TransformationConfig = (fichier: FichierConfig) => FichierConfig;

function analyserJson(contenu: string, chemin: string): unknown {
  try {
    return JSON.parse(contenu);
  } catch {
    throw erreurConfigInvalide("config.json n'est pas un JSON valide.", { chemin });
  }
}

function detailsDepuisZod(erreur: z.ZodError): Record<string, unknown> {
  return { problemes: erreur.issues.map((i) => ({ chemin: i.path.join("."), message: i.message })) };
}

/** Comparaison structurelle, insensible à l'ordre des clés (utilisée uniquement par le garde-fou de périmètre). */
function profondEgal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  const aTableau = Array.isArray(a);
  const bTableau = Array.isArray(b);
  if (aTableau || bTableau) {
    if (!aTableau || !bTableau || a.length !== b.length) return false;
    return a.every((v, i) => profondEgal(v, (b as unknown[])[i]));
  }
  if (typeof a === "object" && a !== null && typeof b === "object" && b !== null) {
    const objetA = a as Record<string, unknown>;
    const objetB = b as Record<string, unknown>;
    const clesA = Object.keys(objetA);
    const clesB = Object.keys(objetB);
    if (clesA.length !== clesB.length) return false;
    return clesA.every((cle) => Object.hasOwn(objetB, cle) && profondEgal(objetA[cle], objetB[cle]));
  }
  return false;
}

/**
 * Vue d'un profil sans `dossiers`/`defaultDossier`, mais conservant l'**autre** environnement de
 * ces deux champs (décision D-T13-2) : seuls `dossiers[environnement]` et
 * `defaultDossier[environnement]` de l'environnement ciblé ont le droit de changer.
 */
function sansMutationAutorisee(profilBrut: ProfilBrut, environnement: Environnement): unknown {
  const { dossiers, defaultDossier, ...reste } = profilBrut;
  const autreEnv: Environnement = environnement === "prod" ? "preprod" : "prod";
  return {
    ...reste,
    dossiersAutreEnvironnement: dossiers[autreEnv],
    defaultDossierAutreEnvironnement: defaultDossier?.[autreEnv],
  };
}

/** Vue du fichier entier sans le profil ciblé, pour vérifier que les autres profils/groupes n'ont pas changé. */
function sansProfil(fichier: FichierConfig, profil: Identifiant): unknown {
  const profiles = { ...fichier.profiles };
  delete (profiles as Record<string, unknown>)[profil];
  return { ...fichier, profiles };
}

/**
 * Garde-fou de périmètre (D-T13-2, issue GOU-372) : seuls `profiles[profil].dossiers[environnement]`
 * et `profiles[profil].defaultDossier[environnement]` peuvent différer entre `original` et `nouveau`.
 */
function verifierPerimetreMutation(
  original: FichierConfig,
  nouveau: FichierConfig,
  profil: Identifiant,
  environnement: Environnement,
): void {
  if (!profondEgal(sansProfil(original, profil), sansProfil(nouveau, profil))) {
    throw erreurConfigInvalide("La modification a changé des données hors du profil ciblé.", { profil });
  }
  const profilOriginal = original.profiles[profil];
  const profilNouveau = nouveau.profiles[profil];
  if (profilOriginal === undefined || profilNouveau === undefined) {
    throw erreurConfigInvalide("La modification a retiré le profil ciblé.", { profil });
  }
  if (!profondEgal(sansMutationAutorisee(profilOriginal, environnement), sansMutationAutorisee(profilNouveau, environnement))) {
    throw erreurConfigInvalide(
      "La modification a changé des champs du profil hors dossiers/defaultDossier de l'environnement visé.",
      { profil, environnement },
    );
  }
}

/** Génère exactement le format attendu (07, issue GOU-372) : JSON indenté de 2 espaces, saut de ligne final. */
export function genererContenuFichierConfig(fichier: FichierConfig): string {
  return `${JSON.stringify(fichier, null, 2)}\n`;
}

/** Écriture atomique sans enveloppe de store (contrairement à `src/storage/store-json.ts`) : `config.json` reste un JSON brut lisible/éditable, mode d'origine conservé. */
async function ecrireConfigAtomique(
  operations: OperationsFichier,
  chemin: string,
  fichier: FichierConfig,
  modeOriginal: number,
): Promise<void> {
  const dir = repertoireParent(chemin);
  const base = basename(chemin);
  const temp = join(dir, `.tmp-${base}-${process.pid}-${randomBytes(8).toString("hex")}`);
  const contenu = genererContenuFichierConfig(fichier);

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
    } finally {
      await operations.fermer(descripteur).catch(() => undefined);
    }
    await operations.definirPermissions(temp, modeOriginal);
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
    // Meilleur effort (même politique que `src/storage/store-json.ts`) : un fsync de répertoire
    // impossible (Windows, ou tout autre échec) n'invalide pas une écriture déjà renommée sur disque.
  }
}

async function executerModification(
  deps: DependancesEcritureConfig,
  profil: Identifiant,
  environnement: Environnement,
  transformation: TransformationConfig,
): Promise<FichierConfig> {
  let contenu: string;
  try {
    contenu = await deps.operations.lireFichier(deps.chemin);
  } catch (erreur) {
    if ((erreur as NodeJS.ErrnoException).code === "ENOENT") {
      throw erreurConfigInvalide(
        "config.json est absent : impossible de modifier une configuration inexistante.",
        { chemin: deps.chemin },
      );
    }
    throw depuisErreurFichier(erreur, deps.chemin);
  }

  let modeOriginal: number;
  try {
    modeOriginal = (await deps.operations.statut(deps.chemin)).mode;
  } catch (erreur) {
    throw depuisErreurFichier(erreur, deps.chemin);
  }

  const lecture = schemaFichierConfig.safeParse(analyserJson(contenu, deps.chemin));
  if (!lecture.success) {
    throw erreurConfigInvalide("config.json invalide, modification refusée.", detailsDepuisZod(lecture.error));
  }
  const original = lecture.data;
  if (!Object.hasOwn(original.profiles, profil)) {
    throw erreurConfigInvalide(`Profil "${profil}" absent de config.json.`, { profil });
  }

  const propose = transformation(original);
  const validation = schemaFichierConfig.safeParse(propose);
  if (!validation.success) {
    throw erreurConfigInvalide("Résultat de la modification invalide.", detailsDepuisZod(validation.error));
  }
  const nouveau = validation.data;
  verifierPerimetreMutation(original, nouveau, profil, environnement);

  await ecrireConfigAtomique(deps.operations, deps.chemin, nouveau, modeOriginal);
  return nouveau;
}

/**
 * Lecture-modification-écriture atomique de `config.json` (D-T13-2, issue GOU-372) : acquiert le
 * verrou `config` (07 §3), relit sous verrou, valide `transformation(original)` avec
 * `schemaFichierConfig` avant toute écriture, puis écrit de façon atomique (temporaire
 * co-localisé, flush, `rename`, mode d'origine conservé). `release()` du verrou suit la même
 * politique que `mettreAJourSousVerrou` (`src/storage/transaction.ts`) : une erreur de `release()`
 * ne masque jamais une erreur du corps.
 */
export async function modifierConfig(
  deps: DependancesEcritureConfig,
  profil: Identifiant,
  environnement: Environnement,
  transformation: TransformationConfig,
): Promise<FichierConfig> {
  const verrou = await deps.verrous.acquire(NOM_VERROU_CONFIG, deps.deadline, deps.signal);
  let resultat: FichierConfig;
  try {
    resultat = await executerModification(deps, profil, environnement, transformation);
  } catch (erreurCorps) {
    await verrou.release().catch(() => undefined);
    throw erreurCorps;
  }
  await verrou.release();
  return resultat;
}
