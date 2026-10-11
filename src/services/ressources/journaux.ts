import { listerJournaux } from "../../adapters/compta/journaux.js";
import type { JournalCpt } from "../../adapters/compta/journaux.js";
import { creerBudget } from "../../http/budget.js";
import type { ContexteService, DepsService, ResultatService } from "../commun/types.js";
import { exigerFamilleRessource } from "./capacites.js";
import { validerEntreeRessource } from "./entrees.js";
import { scannerRessourceDossier } from "./scan-ressource.js";
import { construireSourceListeUnique } from "./source-liste-unique.js";

const SOURCE_ID = "hubbix-compta:/journals";

/**
 * Ressource `ebp://{alias}/journaux` (D-T12-13, 07 §6) : CPT uniquement, référentiel
 * `listerJournaux` lu en un seul appel et borné à 100 éléments par `scanner`.
 */
export async function journauxRessource(
  deps: DepsService,
  ctx: ContexteService,
  entreeBrute: unknown,
): Promise<ResultatService<JournalCpt>> {
  validerEntreeRessource(entreeBrute, "journaux");
  exigerFamilleRessource("journaux", ctx, ["hubbix-compta"]);

  const budget = creerBudget(ctx.execution);
  const budgetInitial = budget.restant;
  const avertissementsSource: string[] = [];

  const source = construireSourceListeUnique<JournalCpt>({
    id: SOURCE_ID,
    idDe: (journal) => journal.id ?? journal.code,
    avertissements: avertissementsSource,
    lire: (budgetAppel) => listerJournaux(deps.http, budgetAppel, ctx.http),
  });

  return scannerRessourceDossier(deps, ctx, budget, budgetInitial, "ressource:journaux", source, avertissementsSource);
}
