import type { Clock } from "../ports/clock.js";

/**
 * Horloge réelle (T13-3, D-T13-12) : seule implémentation de `Clock` qui touche `Date.now()`/
 * `setTimeout` dans tout le code de production — tout le reste du code (`src/config`, `src/auth`,
 * `src/http`, `src/quota`…) reçoit une horloge injectée (07 §1) et n'en construit jamais une elle
 * même. `wait` libère son minuteur dans tous les cas (résolution normale ou annulation). Le
 * minuteur n'est jamais `unref()` : une attente en vol (verrou, quota, observateur) doit tenir le
 * processus ouvert jusqu'à son terme ; seul l'arrêt de `serve` (abandon des signaux) la débloque
 * via `signal`.
 */
export function creerHorlogeReelle(): Clock {
  return {
    now(): Date {
      return new Date();
    },
    wait(durationMs: number, signal?: AbortSignal): Promise<void> {
      return new Promise((resolve) => {
        if (signal?.aborted === true || durationMs <= 0) {
          resolve();
          return;
        }
        const minuteur = setTimeout(() => {
          signal?.removeEventListener("abort", onAbort);
          resolve();
        }, durationMs);
        function onAbort(): void {
          clearTimeout(minuteur);
          resolve();
        }
        signal?.addEventListener("abort", onAbort, { once: true });
      });
    },
  };
}
