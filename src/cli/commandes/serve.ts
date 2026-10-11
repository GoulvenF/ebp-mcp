import { creerFabriqueServeur, demarrerStdio } from "../../mcp/serveur/fabrique.js";
import { composerContexteCli } from "../composition.js";
import type { OptionsCliCommunes } from "../composition.js";
import type { DepsCli } from "../types.js";

/**
 * `ebp-mcp serve` (07 §12, D-T13-12) : attend l'abandon de `deps.signal` (câblé par `src/cli.ts`
 * sur SIGTERM/SIGINT/fin de stdin), puis ferme le serveur et sort en code `0`.
 *
 * `server.close()` du SDK 1.32.1 abandonne déjà tous les `extra.signal` des appels en vol
 * (`Protocol._onclose` : `controller.abort()` pour chaque gestionnaire de requête actif avant même
 * la résolution de leurs promesses) — un appel bloqué dans une attente de quota (`Clock.wait`
 * recevant ce `signal`) est donc débloqué sans attendre son issue. Aucune modification de
 * `src/mcp/serveur/` n'est nécessaire (premier branchement de D-T13-12).
 */
export async function executerServe(options: OptionsCliCommunes, deps: DepsCli): Promise<number> {
  const ctx = await composerContexteCli(options, { env: deps.env, home: deps.home });
  const fabrique = creerFabriqueServeur(ctx.depsPartage, { mode: ctx.mode });
  const serveur = await demarrerStdio(fabrique);

  await new Promise<void>((resolve) => {
    if (deps.signal.aborted) {
      resolve();
      return;
    }
    deps.signal.addEventListener("abort", () => resolve(), { once: true });
  });

  await serveur.close();
  return 0;
}
