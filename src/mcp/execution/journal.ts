import type { EntreeJournalErreur } from "../sortie/erreurs.js";

/**
 * Journal d'exécution d'outil (D-T12-5, 07 §7), toujours `stderr` : seulement outil, id de
 * requête, nom de classe de l'erreur et code — ni message, ni stack, ni entrée reçue.
 */
export interface JournalMcp {
  erreur(entree: EntreeJournalErreur): void;
}

export function creerJournalMcpStderr(): JournalMcp {
  return {
    erreur(entree: EntreeJournalErreur): void {
      process.stderr.write(`${JSON.stringify({ type: "mcp-erreur", ...entree })}\n`);
    },
  };
}
