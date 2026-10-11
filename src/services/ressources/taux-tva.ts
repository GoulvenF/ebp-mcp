import { listerTauxTvaCpt } from "../../adapters/compta/tva.js";
import type { TauxTvaCpt } from "../../adapters/compta/tva.js";
import { listerTauxTva } from "../../adapters/hubbix-gescom/tva.js";
import type { TauxTva } from "../../adapters/hubbix-gescom/tva.js";
import { creerBudget } from "../../http/budget.js";
import type { ContexteService, DepsService, ResultatService } from "../commun/types.js";
import { exigerFamilleRessource } from "./capacites.js";
import { validerEntreeRessource } from "./entrees.js";
import { scannerRessourceDossier } from "./scan-ressource.js";
import { construireSourceListeUnique } from "./source-liste-unique.js";

const SOURCE_ID_CPT = "hubbix-compta:/vat-rate";
const SOURCE_ID_GC = "hubbix-gescom:/vat-rates";

/**
 * Identité locale par position d'élément (D-T12-13) : ni `TauxTvaCpt` ni `TauxTva` ne portent
 * d'identifiant source ; cette ressource ne lit jamais plus d'une page
 * (`construireSourceListeUnique`, `suivant: null`), donc une identité stable **au sein de cette
 * seule page** suffit — jamais réutilisée entre deux appels ni comme identité EBP.
 */
function idParPosition<T extends object>(): (item: T) => string {
  const ids = new WeakMap<object, string>();
  let compteur = 0;
  return (item) => {
    const existant = ids.get(item);
    if (existant !== undefined) {
      return existant;
    }
    const id = `local:${compteur}`;
    compteur += 1;
    ids.set(item, id);
    return id;
  };
}

/**
 * Ressource `ebp://{alias}/taux-tva` (D-T12-13, 07 §6) : disponible sur CPT (`listerTauxTvaCpt`)
 * et GC (`listerTauxTva`), routée par la famille du dossier — jamais les deux adapters appelés
 * pour un même dossier. Chaque branche appelle `scannerRessourceDossier` séparément : construire
 * une `SourcePaginee` de type union (`TauxTvaCpt | TauxTva`) avant l'appel romprait la
 * contravariance de `idElement`.
 */
export async function tauxTvaRessource(
  deps: DepsService,
  ctx: ContexteService,
  entreeBrute: unknown,
): Promise<ResultatService<TauxTvaCpt | TauxTva>> {
  validerEntreeRessource(entreeBrute, "taux-tva");
  exigerFamilleRessource("taux-tva", ctx, ["hubbix-compta", "hubbix-gescom"]);

  const budget = creerBudget(ctx.execution);
  const budgetInitial = budget.restant;
  const avertissementsSource: string[] = [];

  if (ctx.dossier.famille === "hubbix-compta") {
    const source = construireSourceListeUnique<TauxTvaCpt>({
      id: SOURCE_ID_CPT,
      idDe: idParPosition<TauxTvaCpt>(),
      avertissements: avertissementsSource,
      lire: (budgetAppel) => listerTauxTvaCpt(deps.http, budgetAppel, ctx.http),
    });
    return scannerRessourceDossier(deps, ctx, budget, budgetInitial, "ressource:taux-tva", source, avertissementsSource);
  }

  const source = construireSourceListeUnique<TauxTva>({
    id: SOURCE_ID_GC,
    idDe: idParPosition<TauxTva>(),
    avertissements: avertissementsSource,
    lire: (budgetAppel) => listerTauxTva(deps.http, budgetAppel, ctx.http),
  });
  return scannerRessourceDossier(deps, ctx, budget, budgetInitial, "ressource:taux-tva", source, avertissementsSource);
}
