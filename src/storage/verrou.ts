import { createHash, randomBytes } from "node:crypto";
import { hostname } from "node:os";
import { join } from "node:path";
import type { Clock } from "../ports/clock.js";
import type { Lock, LockManager } from "../ports/lock-manager.js";
import type { JournalStockage } from "./store-json.js";
import {
  depuisErreurFichier,
  erreurNomVerrouInvalide,
  erreurVerrouAnnule,
  erreurVerrouDeadlineDepassee,
  erreurVerrouHoteEtranger,
} from "./errors.js";
import type { OperationsFichier } from "./operations-fichier.js";

/**
 * Même forme que les identifiants de profils/alias (07 §2) ; recopiée ici plutôt qu'importée de
 * `src/config/` pour respecter le sens des dépendances (décision 1, fiche T04) : `src/storage/` ne
 * dépend que de `src/domain/` et `src/ports/`.
 */
const RE_IDENTIFIANT_VERROU = /^[a-z0-9][a-z0-9_-]{0,63}$/;

interface ContenuVerrou {
  readonly pid: number;
  readonly hostname: string;
  readonly acquisLe: string;
  readonly jeton: string;
}

export interface DependancesGestionnaireVerrous {
  readonly repertoire: string;
  readonly operations: OperationsFichier;
  readonly clock: Clock;
  readonly journal?: JournalStockage;
}

/**
 * File d'attente au niveau module (décision 10, fiche T04) : sérialise les acquisitions du même
 * fichier de verrou à l'intérieur d'un seul processus, clé = chemin absolu du fichier de verrou
 * (pas l'instance de gestionnaire). Deux {@link creerGestionnaireVerrous} distincts dans le même
 * processus ne peuvent donc jamais détenir le même verrou simultanément.
 */
const filesInternes = new Map<string, Promise<void>>();

function attendreNotreTour(chemin: string): { attente: Promise<void>; terminer: () => void } {
  const precedent = filesInternes.get(chemin) ?? Promise.resolve();
  let terminer!: () => void;
  const notreTour = new Promise<void>((resolve) => {
    terminer = resolve;
  });
  filesInternes.set(chemin, notreTour);
  return { attente: precedent, terminer };
}

function analyserContenuVerrou(texte: string): ContenuVerrou | null {
  try {
    const brut = JSON.parse(texte) as Partial<ContenuVerrou>;
    if (
      typeof brut.pid !== "number" ||
      typeof brut.hostname !== "string" ||
      typeof brut.acquisLe !== "string" ||
      typeof brut.jeton !== "string"
    ) {
      return null;
    }
    return { pid: brut.pid, hostname: brut.hostname, acquisLe: brut.acquisLe, jeton: brut.jeton };
  } catch {
    return null;
  }
}

function pidEstMort(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return false;
  } catch (erreur) {
    return (erreur as NodeJS.ErrnoException).code === "ESRCH";
  }
}

/** Reculs bornés entre deux tentatives, jamais au-delà de la deadline restante. */
function prochainRecul(tentative: number): number {
  return Math.min(25 * 2 ** tentative, 250);
}

/**
 * Isolé dans une fonction dédiée : `signal.aborted` peut changer pendant un `await` (déclenché en
 * dehors de ce module) et ne doit pas être rétréci statiquement par TypeScript entre deux lectures.
 */
function estAnnule(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

/**
 * Attend notre tour dans la file interne du processus (décision 10), borné par `deadline` et
 * annulable par `signal` : un tour qui n'arrive jamais (détenteur précédent qui ne libère pas)
 * ne doit jamais bloquer indéfiniment l'appelant.
 */
async function attendreTourOuLimite(
  attente: Promise<void>,
  deadline: Date,
  clock: Clock,
  signalExterne: AbortSignal | undefined,
): Promise<"pret" | "deadline" | "annule"> {
  if (estAnnule(signalExterne)) return "annule";
  const restant = deadline.getTime() - clock.now().getTime();
  if (restant <= 0) return "deadline";

  const controleurInterne = new AbortController();
  const relayerAnnulation = (): void => controleurInterne.abort();
  signalExterne?.addEventListener("abort", relayerAnnulation, { once: true });
  try {
    const resultat = await Promise.race([
      attente.then((): "pret" => "pret"),
      clock.wait(restant, controleurInterne.signal).then((): "limite" => "limite"),
    ]);
    if (resultat === "pret") {
      controleurInterne.abort();
      return "pret";
    }
    return estAnnule(signalExterne) ? "annule" : "deadline";
  } finally {
    signalExterne?.removeEventListener("abort", relayerAnnulation);
  }
}

export function creerGestionnaireVerrous(deps: DependancesGestionnaireVerrous): LockManager {
  const { repertoire, operations, clock, journal } = deps;
  const hoteLocal = hostname();

  /**
   * Relit `chemin` avec un bref recul borné : entre la création du `.lock` par son propriétaire
   * légitime et sa publication (voir {@link tenterCreation}, lien physique depuis un temporaire
   * fsyncé), un concurrent ne devrait plus jamais observer de contenu partiel. Ce recul reste une
   * seconde ceinture, plus la garantie : la garantie vient de la visibilité atomique du `.lock`.
   */
  async function lireContenuVerrouAvecRecul(
    chemin: string,
  ): Promise<{ texte: string; contenu: ContenuVerrou | null } | "absent"> {
    let dernierTexte = "";
    for (let tentative = 0; tentative < 5; tentative += 1) {
      let texte: string;
      try {
        texte = await operations.lireFichier(chemin);
      } catch (erreur) {
        if ((erreur as NodeJS.ErrnoException).code === "ENOENT") {
          return "absent";
        }
        throw depuisErreurFichier(erreur, chemin);
      }
      dernierTexte = texte;
      const contenu = analyserContenuVerrou(texte);
      if (contenu !== null) {
        return { texte, contenu };
      }
      if (tentative < 4) {
        await clock.wait(10);
      }
    }
    return { texte: dernierTexte, contenu: null };
  }

  async function recupererOuReboucler(nom: string, chemin: string): Promise<"reboucler" | "attendre"> {
    const lu = await lireContenuVerrouAvecRecul(chemin);
    if (lu === "absent") {
      return "reboucler";
    }
    const { texte, contenu } = lu;
    if (contenu === null) {
      await tenterRecuperation(chemin, texte);
      return "reboucler";
    }

    if (contenu.hostname !== hoteLocal) {
      throw erreurVerrouHoteEtranger(nom, contenu.hostname);
    }

    if (pidEstMort(contenu.pid)) {
      await tenterRecuperation(chemin, texte);
      return "reboucler";
    }

    return "attendre";
  }

  /**
   * Récupération d'un verrou périmé (hôte local, pid mort prouvé, ou contenu illisible) — revue
   * T04 : une simple lecture puis `renommer` inconditionnel laisse une fenêtre entre l'observation
   * et l'action où un autre prétendant a pu déjà récupérer et un nouveau propriétaire vivant
   * s'installer ; le `renommer` tardif supprimerait alors le `.lock` **neuf** de ce propriétaire.
   *
   * Revendication exclusive : seul le gagnant d'un `ouvrirExclusif` sur un fichier de revendication
   * dérivé du contenu observé (`texteObserve`, par hachage) a le droit d'agir sur cette récupération
   * précise. Il relit ensuite `chemin` et ne retire le `.lock` que si son contenu est **encore
   * identique** à `texteObserve` : un contenu différent signifie qu'un nouveau propriétaire est déjà
   * en place, et n'est jamais effacé.
   */
  async function tenterRecuperation(chemin: string, texteObserve: string): Promise<void> {
    const empreinte = createHash("sha256").update(texteObserve).digest("hex").slice(0, 16);
    const revendication = `${chemin}.perime-${empreinte}`;

    let descripteur;
    try {
      descripteur = await operations.ouvrirExclusif(revendication, 0o600);
    } catch (erreur) {
      if ((erreur as NodeJS.ErrnoException).code === "EEXIST") {
        return;
      }
      throw depuisErreurFichier(erreur, chemin);
    }

    try {
      await operations.fermer(descripteur);

      let texteActuel: string;
      try {
        texteActuel = await operations.lireFichier(chemin);
      } catch (erreur) {
        if ((erreur as NodeJS.ErrnoException).code === "ENOENT") {
          return;
        }
        throw depuisErreurFichier(erreur, chemin);
      }
      if (texteActuel !== texteObserve) {
        return;
      }

      await operations.supprimer(chemin).catch((erreur) => {
        if ((erreur as NodeJS.ErrnoException).code !== "ENOENT") {
          throw depuisErreurFichier(erreur, chemin);
        }
      });
    } finally {
      await operations.supprimer(revendication).catch(() => undefined);
    }
  }

  /**
   * Publie `chemin` de façon atomique : écrit `contenu` dans un temporaire co-localisé, le fsync,
   * puis le rend visible par un lien physique (`lier`, `EEXIST` si `chemin` existe déjà) — revue
   * T04, point 2. Un `.lock` visible est donc toujours complet : plus de fenêtre où un concurrent
   * observerait un contenu partiel entre la création du fichier et la fin de l'écriture.
   */
  async function tenterCreation(chemin: string, contenu: string): Promise<void> {
    const temp = join(
      repertoire,
      `.tmp-verrou-${randomBytes(8).toString("hex")}-${process.pid}`,
    );
    const descripteur = await operations.ouvrirExclusif(temp, 0o600);
    try {
      try {
        await operations.ecrireTout(descripteur, contenu);
        await operations.synchroniser(descripteur);
      } finally {
        await operations.fermer(descripteur).catch(() => undefined);
      }
    } catch (erreur) {
      await operations.supprimer(temp).catch(() => undefined);
      throw erreur;
    }

    try {
      await operations.lier(temp, chemin);
    } finally {
      await operations.supprimer(temp).catch(() => undefined);
    }
  }

  async function acquisitionFichier(
    nom: string,
    chemin: string,
    deadline: Date,
    signal: AbortSignal | undefined,
  ): Promise<string> {
    const jeton = randomBytes(16).toString("hex");
    let tentative = 0;
    while (true) {
      if (estAnnule(signal)) {
        throw erreurVerrouAnnule(nom);
      }
      const contenu = JSON.stringify({
        pid: process.pid,
        hostname: hoteLocal,
        acquisLe: clock.now().toISOString(),
        jeton,
      } satisfies ContenuVerrou);
      try {
        await tenterCreation(chemin, contenu);
        return jeton;
      } catch (erreur) {
        if ((erreur as NodeJS.ErrnoException).code !== "EEXIST") {
          throw depuisErreurFichier(erreur, chemin);
        }
      }

      const issue = await recupererOuReboucler(nom, chemin);
      if (issue === "reboucler") {
        tentative = 0;
        continue;
      }

      const maintenant = clock.now();
      if (maintenant.getTime() >= deadline.getTime()) {
        throw erreurVerrouDeadlineDepassee(nom);
      }
      const attenteMs = Math.min(prochainRecul(tentative), deadline.getTime() - maintenant.getTime());
      tentative += 1;
      await clock.wait(attenteMs, signal);
      if (estAnnule(signal)) {
        throw erreurVerrouAnnule(nom);
      }
    }
  }

  return {
    async acquire(nom: string, deadline: Date, signal?: AbortSignal): Promise<Lock> {
      if (!RE_IDENTIFIANT_VERROU.test(nom)) {
        throw erreurNomVerrouInvalide(nom);
      }
      const chemin = join(repertoire, `${nom}.lock`);
      const { attente, terminer } = attendreNotreTour(chemin);

      const tour = await attendreTourOuLimite(attente, deadline, clock, signal);
      if (tour !== "pret") {
        terminer();
        throw tour === "annule" ? erreurVerrouAnnule(nom) : erreurVerrouDeadlineDepassee(nom);
      }

      let jeton: string;
      try {
        jeton = await acquisitionFichier(nom, chemin, deadline, signal);
      } catch (erreur) {
        terminer();
        throw erreur;
      }

      let libere = false;
      return {
        async release(): Promise<void> {
          if (libere) return;
          libere = true;
          try {
            let texte: string | null;
            try {
              texte = await operations.lireFichier(chemin);
            } catch (erreur) {
              if ((erreur as NodeJS.ErrnoException).code === "ENOENT") {
                texte = null;
              } else {
                throw depuisErreurFichier(erreur, chemin);
              }
            }
            const contenu = texte === null ? null : analyserContenuVerrou(texte);
            if (contenu !== null && contenu.jeton === jeton) {
              await operations.supprimer(chemin).catch((erreur) => {
                if ((erreur as NodeJS.ErrnoException).code !== "ENOENT") {
                  throw depuisErreurFichier(erreur, chemin);
                }
              });
            } else if (contenu !== null) {
              journal?.avertir(`Verrou ${nom} déjà remplacé par un autre propriétaire ; aucune suppression.`);
            }
          } finally {
            terminer();
          }
        },
      };
    },
  };
}
