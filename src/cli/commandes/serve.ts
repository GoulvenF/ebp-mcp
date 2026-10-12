import { creerFabriqueServeur, demarrerStdio } from "../../mcp/serveur/fabrique.js";
import { composerContexteCli } from "../composition.js";
import type { OptionsCliCommunes } from "../composition.js";
import { fermerAvecDelai } from "../fermeture.js";
import type { DepsCli } from "../types.js";

/** Délai maximal entre l'abandon du signal et la fermeture effective (D-T13-12, 07 §12). */
const DEADLINE_FERMETURE_MS = 5000;

/**
 * `ebp-mcp serve` (07 §12, D-T13-12) : attend l'abandon de `deps.signal` (câblé par `src/cli.ts`
 * sur SIGTERM/SIGINT/fin de stdin), puis ferme le serveur et sort en code `0`.
 *
 * `server.close()` du SDK 1.32.1 abandonne déjà tous les `extra.signal` des appels en vol
 * (`Protocol._onclose` : `controller.abort()` pour chaque gestionnaire de requête actif avant même
 * la résolution de leurs promesses) — un appel bloqué dans une attente de quota (`Clock.wait`
 * recevant ce `signal`) est donc débloqué sans attendre son issue. Aucune modification de
 * `src/mcp/serveur/` n'est nécessaire (premier branchement de D-T13-12).
 *
 * `serveur.close()` lui-même n'a pas de borne : au-delà de `DEADLINE_FERMETURE_MS`, on journalise
 * sur stderr et on sort en code `1` plutôt que d'attendre indéfiniment une fermeture qui ne vient
 * jamais. Ce dépassement signifie justement que des handles restent ouverts (c'est ce qui bloque
 * `serveur.close()`) : `deps.forcerSortie` appelle `process.exit` pour garantir la sortie, un
 * simple `process.exitCode` ne suffirait pas à faire sortir le processus.
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

  const fermetureDansLesTemps = await fermerAvecDelai(() => serveur.close(), DEADLINE_FERMETURE_MS);

  if (!fermetureDansLesTemps) {
    deps.stderr.write(`Arrêt forcé : la fermeture du serveur a dépassé ${DEADLINE_FERMETURE_MS} ms.\n`);
    deps.forcerSortie(1);
  }
  return 0;
}
