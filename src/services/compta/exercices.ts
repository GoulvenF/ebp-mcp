import { lireParametresDossier } from "../../adapters/compta/domaine.js";
import type { ExerciceSchema } from "../../domain/schemas/compta.js";
import { creerBudget } from "../../http/budget.js";
import { verifierCapacitesEntree } from "../commun/capacites.js";
import { ExercicesEntreeSchema, validerEntree } from "../commun/entrees.js";
import type { ContexteService, DepsService, ResultatService } from "../commun/types.js";
import { exigerFamilleOutil } from "../commun/types.js";
import type { z } from "zod";

type Exercice = z.infer<typeof ExerciceSchema>;

/**
 * `exercices` (D-T11-16) : aucune entrée spécifique, lecture directe `/folder-settings`. Forme de
 * sortie `resultats: [{exercices}]` (un objet unique portant le tableau), pas un tableau
 * d'exercices directement (07 §6, critère de test de l'issue) ; `pagination: null`.
 */
export async function exercices(
  deps: DepsService,
  ctx: ContexteService,
  entreeBrute: unknown,
): Promise<ResultatService<{ exercices: Exercice[] }>> {
  exigerFamilleOutil("exercices", ctx);
  const entree = validerEntree(ExercicesEntreeSchema, entreeBrute, "exercices");
  verifierCapacitesEntree("exercices", ctx.dossier.famille, entree);

  const budget = creerBudget(ctx.execution);
  const budgetInitial = budget.restant;
  const { resultat, avertissements, sourceEbp } = await lireParametresDossier(deps.http, budget, ctx.http);

  return {
    dossier: ctx.dossier.id,
    resultats: [{ exercices: resultat.exercices }],
    bruts: entree.inclure_brut ? [sourceEbp] : null,
    pagination: null,
    completude: "complete",
    raison_arret: null,
    approximatif: false,
    avertissements,
    sources: ["hubbix-compta:/folder-settings"],
    appels_source: 1,
    tentatives: budgetInitial - budget.restant,
  };
}
