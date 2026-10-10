import type { Tiers } from "../../adapters/compta/tiers.js";
import { listerTiers } from "../../adapters/compta/tiers.js";
import { creerBudget } from "../../http/budget.js";
import type { IdentiteScan } from "../../pagination/scan.js";
import { scanner } from "../../pagination/scan.js";
import { verifierCapacitesEntree } from "../commun/capacites.js";
import { RechercherTiersEntreeSchema, validerEntree } from "../commun/entrees.js";
import { correspondTexte } from "../commun/texte.js";
import type { ContexteService, DepsService, ResultatService } from "../commun/types.js";
import { exigerFamilleOutil } from "../commun/types.js";
import type { ElementEnveloppe } from "./pagination-skip-take.js";
import { construireSourceSkipTake } from "./pagination-skip-take.js";

const SOURCE_ID = "hubbix-compta:/auxiliary-accounts";

/**
 * `rechercher_tiers` (07 §6, D-T11-5) : CPT uniquement. `texte` filtre localement sur
 * `[nom, compte]` (`correspondTexte`, D-T11-4) ; `actif` filtre localement par égalité stricte ;
 * `type` est refusé avant réseau par `verifierCapacitesEntree` (D-T11-6, valeurs non prouvées,
 * E07). Jamais `search`/`isActive` envoyés à l'adapter (D-T11-5) : seuls `skip`/`take` partent en
 * requête, le filtrage reste local sous budget.
 */
export async function rechercherTiers(
  deps: DepsService,
  ctx: ContexteService,
  entreeBrute: unknown,
): Promise<ResultatService<Tiers>> {
  exigerFamilleOutil("rechercher_tiers", ctx);
  const entree = validerEntree(RechercherTiersEntreeSchema, entreeBrute, "rechercher_tiers");
  verifierCapacitesEntree("rechercher_tiers", ctx.dossier.famille, entree);

  const budget = creerBudget(ctx.execution);
  const budgetInitial = budget.restant;
  const avertissementsSource: string[] = [];
  const bruts: unknown[] = [];

  const source = construireSourceSkipTake<Tiers>({
    id: SOURCE_ID,
    nature: "referentiel",
    idDe: (tiers) => tiers.id,
    avertissements: avertissementsSource,
    lirePage: (skip, take, budgetAppel) => listerTiers(deps.http, budgetAppel, ctx.http, { skip, take }),
  });

  const filtre = (enveloppe: ElementEnveloppe<Tiers>): boolean => {
    const tiers = enveloppe.item;
    if (entree.texte !== undefined && !correspondTexte(entree.texte, [tiers.nom, tiers.compte])) {
      return false;
    }
    if (entree.actif !== undefined && tiers.actif !== entree.actif) {
      return false;
    }
    return true;
  };

  const identite: IdentiteScan = {
    outil: "rechercher_tiers",
    profil: ctx.execution.profil,
    identiteGeneration: ctx.execution.identiteGeneration,
    environnement: ctx.execution.environnement,
    famille: ctx.dossier.famille,
    dossier: ctx.dossier.id,
    limite: entree.limite,
    filtres: { texte: entree.texte ?? null, actif: entree.actif ?? null },
  };

  const resultatScan = await scanner(deps.scan, {
    contexte: ctx.execution,
    source,
    limite: entree.limite,
    ...(entree.curseur !== undefined ? { curseur: entree.curseur } : {}),
    identite,
    filtre,
    budget,
    projeter: (enveloppe) => {
      if (entree.inclure_brut) bruts.push(enveloppe.brutEbp);
      return enveloppe.item;
    },
  });

  return {
    dossier: ctx.dossier.id,
    resultats: resultatScan.resultats,
    bruts: entree.inclure_brut ? bruts : null,
    pagination: resultatScan.pagination,
    completude: resultatScan.completude,
    raison_arret: resultatScan.raisonArret,
    approximatif: resultatScan.approximatif,
    avertissements: [...avertissementsSource, ...resultatScan.avertissements],
    sources: resultatScan.sources,
    appels_source: resultatScan.appelsSource,
    tentatives: budgetInitial - budget.restant,
  };
}
