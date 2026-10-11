import type { Famille } from "../../domain/capabilities.js";
import { erreurFamilleIncompatible } from "../commun/erreurs.js";
import type { ContexteService } from "../commun/types.js";

/**
 * Garde de famille pour une ressource de dossier (D-T12-13), même principe que
 * `exigerFamilleOutil` (`commun/types.ts`) mais pour un nom de ressource plutôt qu'un
 * `OutilMetier` des 14 outils métier : `ebp://{alias}/journaux` etc. ne sont pas des outils et ne
 * figurent pas dans `FAMILLES_OUTIL`. Refuse `UNSUPPORTED_CAPABILITY` avant tout réseau.
 */
export function exigerFamilleRessource(
  ressource: string,
  ctx: ContexteService,
  famillesAcceptees: readonly Famille[],
): void {
  if (ctx.dossier.famille !== ctx.http.famille || !famillesAcceptees.includes(ctx.dossier.famille)) {
    throw erreurFamilleIncompatible(ressource, ctx.dossier.famille, famillesAcceptees);
  }
}
