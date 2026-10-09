import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Clock, OperationsFichier } from "../../dist/index.js";

/** Répertoire temporaire sous un préfixe propre, nettoyé par le test appelant. */
export async function creerRepertoireTemporaire(): Promise<string> {
  return mkdtemp(join(tmpdir(), "ebp-mcp-quota-"));
}

export async function nettoyerRepertoire(chemin: string): Promise<void> {
  await rm(chemin, { recursive: true, force: true });
}

interface Attente {
  readonly reveil: number;
  readonly signal: AbortSignal | undefined;
  resolve(): void;
}

export interface HorlogePilotee extends Clock {
  /** Avance l'horloge à `instant` et résout toute attente devenue due, puis cède des microtasks. */
  avancerA(instant: Date): Promise<void>;
  avancerDe(ms: number): Promise<void>;
  /**
   * Vrai si une attente est actuellement en cours (ni résolue, ni annulée) pour exactement ce
   * `signal` (identité stricte). Le gestionnaire de verrous (`verrou.ts`) attend aussi via cette
   * horloge, mais toujours avec son propre `AbortController` interne — jamais `undefined` ni le
   * `signal` externe de l'appelant — donc ce filtre isole sans ambiguïté l'attente d'espacement ou
   * de cooldown du module quota lui-même (critères 3, 11, 12).
   */
  attenteEnCoursPour(signal: AbortSignal | undefined): boolean;
  /** Tous les `signal` avec lesquels `wait` a été appelé, dans l'ordre (critères 2, 7, 9). */
  signauxAttentes(): readonly (AbortSignal | undefined)[];
}

/**
 * Horloge pilotée par le test (aucun minuteur réel) : `wait` enregistre une attente qui ne se
 * résout que lorsque le test fait avancer l'horloge via `avancerA`/`avancerDe` jusqu'au réveil, ou
 * lorsque `signal` est déclenché. Permet de prouver qu'un verrou est libre pendant une attente
 * (critère 11) sans dépendre de minuteurs réels ni de délais de test arbitraires.
 */
export function creerHorlogePilotee(depart: Date): HorlogePilotee {
  let instant = depart;
  const signaux: (AbortSignal | undefined)[] = [];
  const attentes: Attente[] = [];

  function purger(): void {
    for (let i = attentes.length - 1; i >= 0; i -= 1) {
      const attente = attentes[i];
      if (attente !== undefined && attente.reveil <= instant.getTime()) {
        attentes.splice(i, 1);
        attente.resolve();
      }
    }
  }

  return {
    now(): Date {
      return new Date(instant.getTime());
    },
    wait(duree: number, signal?: AbortSignal): Promise<void> {
      signaux.push(signal);
      return new Promise((resolve) => {
        if (signal?.aborted === true || duree <= 0) {
          resolve();
          return;
        }
        const entree: Attente = { reveil: instant.getTime() + duree, signal, resolve };
        attentes.push(entree);
        signal?.addEventListener(
          "abort",
          () => {
            const index = attentes.indexOf(entree);
            if (index !== -1) {
              attentes.splice(index, 1);
            }
            resolve();
          },
          { once: true },
        );
      });
    },
    async avancerA(nouvelInstant: Date): Promise<void> {
      instant = nouvelInstant;
      // Purge à chaque tour, pas une seule fois : une attente peut s'enregistrer *après* ce point
      // (le code sous test est encore en train de relire l'état sous verrou via de vraies E/S),
      // alors que l'horloge est déjà à `nouvelInstant` — sans quoi elle ne serait jamais résolue.
      for (let tour = 0; tour < 20; tour += 1) {
        purger();
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
    },
    async avancerDe(ms: number): Promise<void> {
      await this.avancerA(new Date(instant.getTime() + ms));
    },
    attenteEnCoursPour(signal: AbortSignal | undefined): boolean {
      return attentes.some((attente) => attente.signal === signal);
    },
    signauxAttentes(): readonly (AbortSignal | undefined)[] {
      return signaux;
    },
  };
}

/** Fait échouer l'opération `nomOp` dès que `predicat(args)` est vrai, sans monkey-patch `node:fs`. */
export function avecEchecSiPredicat(
  base: OperationsFichier,
  nomOp: keyof OperationsFichier,
  predicat: (args: unknown[]) => boolean,
  code: string,
): OperationsFichier {
  return new Proxy(base, {
    get(cible, propriete, recepteur) {
      const original = Reflect.get(cible, propriete, recepteur);
      if (propriete !== nomOp || typeof original !== "function") {
        return original;
      }
      return (...args: unknown[]) => {
        if (predicat(args)) {
          const erreur = new Error(code) as NodeJS.ErrnoException;
          erreur.code = code;
          return Promise.reject(erreur);
        }
        return (original as (...a: unknown[]) => unknown).apply(cible, args);
      };
    },
  });
}
