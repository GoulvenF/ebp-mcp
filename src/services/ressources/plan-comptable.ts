import { listerComptesGeneraux } from "../../adapters/compta/comptes.js";
import type { CompteGeneral } from "../../adapters/compta/comptes.js";
import { creerBudget } from "../../http/budget.js";
import type { ContexteService, DepsService, ResultatService } from "../commun/types.js";
import { exigerFamilleRessource } from "./capacites.js";
import { validerEntreeRessource } from "./entrees.js";
import { scannerRessourceDossier } from "./scan-ressource.js";
import { construireSourceListeUnique } from "./source-liste-unique.js";

const SOURCE_ID = "hubbix-compta:/general-account";

/**
 * Ressource `ebp://{alias}/plan-comptable` (D-T12-13, 07 §6) : CPT uniquement, référentiel
 * `listerComptesGeneraux` lu en un seul appel et borné à 100 éléments par `scanner`.
 */
export async function planComptableRessource(
  deps: DepsService,
  ctx: ContexteService,
  entreeBrute: unknown,
): Promise<ResultatService<CompteGeneral>> {
  validerEntreeRessource(entreeBrute, "plan-comptable");
  exigerFamilleRessource("plan-comptable", ctx, ["hubbix-compta"]);

  const budget = creerBudget(ctx.execution);
  const budgetInitial = budget.restant;
  const avertissementsSource: string[] = [];

  const source = construireSourceListeUnique<CompteGeneral>({
    id: SOURCE_ID,
    idDe: (compte) => compte.id ?? compte.numero,
    avertissements: avertissementsSource,
    lire: (budgetAppel) => listerComptesGeneraux(deps.http, budgetAppel, ctx.http),
  });

  return scannerRessourceDossier(
    deps,
    ctx,
    budget,
    budgetInitial,
    "ressource:plan-comptable",
    source,
    avertissementsSource,
  );
}
