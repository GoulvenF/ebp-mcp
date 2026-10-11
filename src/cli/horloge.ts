import type { Clock } from "../ports/clock.js";

/**
 * Horloge réelle (T13-3, D-T13-9) : seule implémentation de `Clock` qui touche `Date.now()`/
 * `setTimeout` dans tout le code de production — tout le reste du code (`src/config`, `src/auth`,
 * `src/http`, `src/quota`…) reçoit une horloge injectée (07 §1) et n'en construit jamais une elle
 * même. `wait` libère son minuteur dans tous les cas (résolution normale ou annulation), pour ne
 * jamais laisser un timer actif retenir l'event loop après la fin d'un appel.
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
        // `unref()` (Node) : un minuteur d'attente ne doit jamais, à lui seul, empêcher le
        // processus de sortir rapidement après `server.close()` (D-T13-9, délai de 5 s).
        minuteur.unref?.();
        function onAbort(): void {
          clearTimeout(minuteur);
          resolve();
        }
        signal?.addEventListener("abort", onAbort, { once: true });
      });
    },
  };
}
