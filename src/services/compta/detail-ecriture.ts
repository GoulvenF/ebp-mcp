import type { Ecriture } from "../../adapters/compta/ecritures.js";
import { lireEcriture } from "../../adapters/compta/ecritures.js";
import { creerBudget } from "../../http/budget.js";
import { verifierCapacitesEntree } from "../commun/capacites.js";
import { DetailEcritureEntreeSchema, validerEntree } from "../commun/entrees.js";
import type { ContexteService, DepsService, ResultatService } from "../commun/types.js";
import { exigerFamilleOutil } from "../commun/types.js";

/** `detail_ecriture` (D-T11-16) : lecture directe `/entries/{uuid}`, aucun scan, pas de pagination. */
export async function detailEcriture(
  deps: DepsService,
  ctx: ContexteService,
  entreeBrute: unknown,
): Promise<ResultatService<Ecriture>> {
  exigerFamilleOutil("detail_ecriture", ctx);
  const entree = validerEntree(DetailEcritureEntreeSchema, entreeBrute, "detail_ecriture");
  verifierCapacitesEntree("detail_ecriture", ctx.dossier.famille, entree);

  const budget = creerBudget(ctx.execution);
  const budgetInitial = budget.restant;
  const { resultat, avertissements, sourceEbp } = await lireEcriture(deps.http, budget, ctx.http, entree.id);

  return {
    dossier: ctx.dossier.id,
    resultats: [resultat],
    bruts: entree.inclure_brut ? [sourceEbp] : null,
    pagination: null,
    completude: "complete",
    raison_arret: null,
    approximatif: false,
    avertissements,
    sources: ["hubbix-compta:/entries/{uuid}"],
    appels_source: 1,
    tentatives: budgetInitial - budget.restant,
  };
}
