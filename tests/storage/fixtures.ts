import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Clock, OperationsFichier } from "../../dist/index.js";

/** Horloge réelle (petits délais), nécessaire aux tests de verrou et multi-processus. */
export function creerHorlogeReelle(): Clock {
  return {
    now(): Date {
      return new Date();
    },
    wait(duree: number, signal?: AbortSignal): Promise<void> {
      return new Promise((resolve) => {
        if (signal?.aborted === true) {
          resolve();
          return;
        }
        const minuteur = setTimeout(resolve, duree);
        signal?.addEventListener(
          "abort",
          () => {
            clearTimeout(minuteur);
            resolve();
          },
          { once: true },
        );
      });
    },
  };
}

/** Répertoire temporaire sous un préfixe propre, nettoyé par le test appelant. */
export async function creerRepertoireTemporaire(): Promise<string> {
  return mkdtemp(join(tmpdir(), "ebp-mcp-storage-"));
}

export async function nettoyerRepertoire(chemin: string): Promise<void> {
  await rm(chemin, { recursive: true, force: true });
}

/**
 * Décore `base` pour faire échouer la N-ième occurrence (1-indexée) de l'opération `nomOp` avec
 * l'erreur `code` fournie. Aucun monkey-patch de `node:fs` : on décore uniquement le port injecté.
 */
export function avecEchecInjecte(
  base: OperationsFichier,
  nomOp: keyof OperationsFichier,
  occurrence: number,
  code: string,
): OperationsFichier {
  let compte = 0;
  return new Proxy(base, {
    get(cible, propriete, recepteur) {
      const original = Reflect.get(cible, propriete, recepteur);
      if (propriete !== nomOp || typeof original !== "function") {
        return original;
      }
      return (...args: unknown[]) => {
        compte += 1;
        if (compte === occurrence) {
          const erreur = new Error(code) as NodeJS.ErrnoException;
          erreur.code = code;
          return Promise.reject(erreur);
        }
        return (original as (...a: unknown[]) => unknown).apply(cible, args);
      };
    },
  });
}

/** Compte les appels réels d'une opération et conserve les arguments de chaque appel. */
export function avecEspion(
  base: OperationsFichier,
  nomOp: keyof OperationsFichier,
): { operations: OperationsFichier; appels: unknown[][] } {
  const appels: unknown[][] = [];
  const operations = new Proxy(base, {
    get(cible, propriete, recepteur) {
      const original = Reflect.get(cible, propriete, recepteur);
      if (propriete !== nomOp || typeof original !== "function") {
        return original;
      }
      return (...args: unknown[]) => {
        appels.push(args);
        return (original as (...a: unknown[]) => unknown).apply(cible, args);
      };
    },
  });
  return { operations, appels };
}
