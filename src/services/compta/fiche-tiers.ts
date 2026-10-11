import type { Tiers } from "../../adapters/compta/tiers.js";
import { lireTiers, listerTiers } from "../../adapters/compta/tiers.js";
import type { ClientGc } from "../../adapters/hubbix-gescom/clients.js";
import { lireClient } from "../../adapters/hubbix-gescom/clients.js";
import { creerBudget } from "../../http/budget.js";
import type { IdentiteScan } from "../../pagination/scan.js";
import { verifierCapacitesEntree } from "../commun/capacites.js";
import { FicheTiersEntreeSchema, validerEntree } from "../commun/entrees.js";
import { resoudreUnique } from "../commun/resolution.js";
import type { ContexteService, DepsService, ResultatService } from "../commun/types.js";
import { exigerFamilleOutil } from "../commun/types.js";
import type { ElementEnveloppe } from "./pagination-skip-take.js";
import { construireSourceSkipTake } from "./pagination-skip-take.js";

const SOURCE_TIERS = "hubbix-compta:/auxiliary-accounts";

/**
 * `fiche_tiers` (D-T11-15) : exactement un de `id`/`code` (forme garantie par le schéma Zod).
 * Routage par famille :
 *  - CPT + `code` : lecture directe `/auxiliary-accounts/{numero}` (1 appel) ;
 *  - CPT + `id` (UUID) : résolution exacte (D-T11-3) sur `/auxiliary-accounts`, puis lecture par
 *    le compte trouvé ;
 *  - GC + `id` : lecture directe `/customers/{id}` ;
 *  - GC + `code` : déjà refusé avant réseau par `verifierCapacitesEntree` (D-T11-6), jamais atteint
 *    ici.
 * `inclure_brut` sur la branche GC reste `null`, avec un avertissement explicite si `true` était
 * demandé : `lireClient` (adapter GesCom, hors périmètre d'extension additive de ce lot) n'expose
 * aucun élément source brut aligné — limite documentée plutôt que contournée en silence.
 */
export async function ficheTiers(
  deps: DepsService,
  ctx: ContexteService,
  entreeBrute: unknown,
): Promise<ResultatService<Tiers | ClientGc>> {
  const entree = validerEntree(FicheTiersEntreeSchema, entreeBrute, "fiche_tiers");
  exigerFamilleOutil("fiche_tiers", ctx);
  verifierCapacitesEntree("fiche_tiers", ctx.dossier.famille, entree);

  const budget = creerBudget(ctx.execution);
  const budgetInitial = budget.restant;

  if (ctx.dossier.famille === "hubbix-gescom") {
    // `code` est refusé avant réseau par le manifeste de capacités (D-T11-6) : `id` est garanti ici.
    const id = entree.id as string;
    const resultat = await lireClient(deps.http, budget, ctx.http, id);
    return {
      dossier: ctx.dossier.id,
      resultats: [resultat],
      bruts: null,
      pagination: null,
      completude: "complete",
      raison_arret: null,
      approximatif: false,
      avertissements: entree.inclure_brut
        ? ["élément source brut non disponible pour cette famille dans cette version."]
        : [],
      sources: ["hubbix-gescom:/customers/{id}"],
      appels_source: 1,
      tentatives: budgetInitial - budget.restant,
    };
  }

  // Famille hubbix-compta.
  if (entree.code !== undefined) {
    const { resultat, avertissements, sourceEbp } = await lireTiers(deps.http, budget, ctx.http, entree.code);
    return {
      dossier: ctx.dossier.id,
      resultats: [resultat],
      bruts: entree.inclure_brut ? [sourceEbp] : null,
      pagination: null,
      completude: "complete",
      raison_arret: null,
      approximatif: false,
      avertissements,
      sources: ["hubbix-compta:/auxiliary-accounts/{numero}"],
      appels_source: 1,
      tentatives: budgetInitial - budget.restant,
    };
  }

  // `id` (UUID) : résolution exacte (D-T11-3) sur `/auxiliary-accounts`, puis lecture par compte.
  const avertissementsSource: string[] = [];
  let appelsListe = 0;
  const source = construireSourceSkipTake<Tiers>({
    id: SOURCE_TIERS,
    nature: "referentiel",
    idDe: (tiers) => tiers.id,
    avertissements: avertissementsSource,
    onPageLue: () => {
      appelsListe += 1;
    },
    lirePage: (skip, take, budgetAppel) => listerTiers(deps.http, budgetAppel, ctx.http, { skip, take }),
  });

  const identite: IdentiteScan = {
    outil: "fiche_tiers",
    profil: ctx.execution.profil,
    identiteGeneration: ctx.execution.identiteGeneration,
    environnement: ctx.execution.environnement,
    famille: ctx.dossier.famille,
    dossier: ctx.dossier.id,
    limite: 2,
    filtres: { id: entree.id },
  };

  const trouve = await resoudreUnique<ElementEnveloppe<Tiers>>(deps.scan, {
    contexte: ctx.execution,
    budget,
    source,
    identite,
    correspond: (enveloppe) => enveloppe.item.id === entree.id,
  });

  const { resultat, avertissements, sourceEbp } = await lireTiers(deps.http, budget, ctx.http, trouve.item.compte);

  return {
    dossier: ctx.dossier.id,
    resultats: [resultat],
    bruts: entree.inclure_brut ? [sourceEbp] : null,
    pagination: null,
    completude: "complete",
    raison_arret: null,
    approximatif: false,
    avertissements: [...avertissementsSource, ...avertissements],
    sources: [SOURCE_TIERS, "hubbix-compta:/auxiliary-accounts/{numero}"],
    appels_source: appelsListe + 1,
    tentatives: budgetInitial - budget.restant,
  };
}
