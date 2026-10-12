import { VERSION } from "../version.js";
import { AIDE_COURTE_USAGE, AIDE_GLOBALE, aidePourCommande } from "./aide.js";
import { executerDossiers } from "./commandes/dossiers.js";
import { executerLogin } from "./commandes/login.js";
import { executerLogout } from "./commandes/logout.js";
import { executerServe } from "./commandes/serve.js";
import { executerStatus } from "./commandes/status.js";
import { ErreurUsageCli, codeSortiePourErreur, ligneErreurCli } from "./exit-codes.js";
import { analyserArgv, detecterAideEtCommande } from "./parse-args.js";
import type { DepsCli } from "./types.js";

/**
 * Point d'entrée commun du binaire (07 §12, D-T13-1/D-T13-2) : `src/cli.ts` ne fait que construire
 * `DepsCli` et appeler cette fonction. `--version`/`--help` globaux sont détectés de façon
 * permissive (`detecterAideEtCommande`, sans lever d'erreur sur une option par ailleurs inconnue)
 * avant l'analyse stricte ; toute commande/option invalide passe ensuite par
 * {@link analyserArgv}, qui lève {@link ErreurUsageCli} (code 2). Aucune exception ne doit
 * traverser cette fonction : la table de `exit-codes.ts` couvre toute erreur du domaine, le reste
 * devient `UPSTREAM_UNAVAILABLE` (code 1).
 */
export async function executerCli(argv: readonly string[], deps: DepsCli): Promise<number> {
  const detection = detecterAideEtCommande(argv);
  if (detection.version) {
    deps.stdout.write(`${VERSION}\n`);
    return 0;
  }
  if (detection.commandeTexte === undefined && detection.aide) {
    deps.stdout.write(AIDE_GLOBALE);
    return 0;
  }

  try {
    const options = analyserArgv(argv);
    if (options.aide) {
      deps.stdout.write(aidePourCommande(options.commande));
      return 0;
    }

    switch (options.commande) {
      case "serve":
        return await executerServe(options, deps);
      case "login":
        return await executerLogin(options, deps);
      case "logout":
        return await executerLogout(options, deps);
      case "status":
        return await executerStatus(options, deps);
      case "dossiers":
        return await executerDossiers(
          options.sousCommandeDossiers as "list" | "add" | "remove",
          options,
          deps,
        );
    }
  } catch (erreur) {
    deps.stderr.write(`${ligneErreurCli(erreur)}\n`);
    if (erreur instanceof ErreurUsageCli) {
      deps.stderr.write(AIDE_COURTE_USAGE);
    }
    return codeSortiePourErreur(erreur);
  }
}
