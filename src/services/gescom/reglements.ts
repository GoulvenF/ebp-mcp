import type { Reglement } from "../../adapters/hubbix-gescom/reglements.js";
import { listerReglements as listerReglementsAdapter } from "../../adapters/hubbix-gescom/reglements.js";
import { creerBudget } from "../../http/budget.js";
import { decimalCompare } from "../../domain/decimal.js";
import { joursCivilsEntre } from "../../domain/date.js";
import { scanner } from "../../pagination/scan.js";
import { ListerReglementsEntreeSchema, validerEntree } from "../commun/entrees.js";
import { erreurCapaciteNonSupporteeService } from "../commun/erreurs.js";
import { exigerFamilleOutil, type ContexteService, type DepsService, type ResultatService } from "../commun/types.js";
import { identiteScanGescom } from "./identite.js";
import { resultatServiceDepuisScan } from "./resultats.js";
import { sourceDepuisSkipTakeAvecSource, type ElementAvecSource } from "./sources.js";

/**
 * `lister_reglements` (07 §6/§8, D-T11-10). `tiers` refusé avant tout réseau (A14) : la source
 * `/settlements` ne fournit pas d'identifiant tiers (`tiers_id` reste toujours `null`). Seuls
 * `skip`/`take` partent au serveur ; `du`/`au`/`non_affectes` sont des filtres locaux après scan.
 */
export async function listerReglementsService(
  deps: DepsService,
  ctx: ContexteService,
  entreeBrute: unknown,
): Promise<ResultatService<Reglement>> {
  const entree = validerEntree(ListerReglementsEntreeSchema, entreeBrute, "lister_reglements");
  exigerFamilleOutil("lister_reglements", ctx);

  if (entree.tiers !== undefined) {
    throw erreurCapaciteNonSupporteeService(
      "lister_reglements",
      "tiers",
      "`lister_reglements.tiers` refusé : la source ne fournit pas d'identifiant tiers prouvé (07 §6).",
      entree.tiers,
    );
  }

  const budget = creerBudget(ctx.execution);
  // `/settlements` ne porte aucun identifiant unique (ni `id` ni `code` garanti non-null/non-dupliqué) ;
  // la clé de position `skip`+index, portée par l'élément lui-même (`ElementAvecSource.cle`),
  // sert d'identité stable pour le moteur de scan — y compris pour une page servie depuis le
  // cache ou reprise via un curseur (correctif revue PR#19 : l'ancienne `WeakMap` locale au call
  // ne survivait pas à un hit de cache, ce qui écrasait tout à `"inconnu"` et faisait disparaître
  // des pages entières par déduplication).
  const source = sourceDepuisSkipTakeAvecSource<Reglement>(
    "hubbix-gescom:/settlements",
    "transactionnel",
    100,
    () => null,
    async (skip, take, b) => {
      const page = await listerReglementsAdapter(deps.http, b, ctx.http, { skip, take });
      return {
        resultats: page.resultats,
        total_source: page.total_source,
        renvoyes: page.renvoyes,
        skip_renvoye: page.skip_renvoye,
        sourcesEbp: page.sourcesEbp,
      };
    },
  );

  let exclusNonAffectesInconnu = 0;

  const filtre = (element: ElementAvecSource<Reglement>): boolean => {
    const reglement = element.objet;
    if (entree.du !== undefined && (reglement.date === null || joursCivilsEntre(entree.du, reglement.date) < 0)) return false;
    if (entree.au !== undefined && (reglement.date === null || joursCivilsEntre(reglement.date, entree.au) < 0)) return false;
    if (entree.non_affectes) {
      if (reglement.montant_restant_a_affecter === null) {
        exclusNonAffectesInconnu += 1;
        return false;
      }
      if (decimalCompare(reglement.montant_restant_a_affecter, "0") <= 0) return false;
    }
    return true;
  };

  const projeter = (element: ElementAvecSource<Reglement>): { objet: Reglement; source: unknown } => ({
    objet: element.objet,
    source: element.source,
  });

  const resultat = await scanner<ElementAvecSource<Reglement>, { objet: Reglement; source: unknown }>(deps.scan, {
    contexte: ctx.execution,
    budget,
    source,
    limite: entree.limite,
    identite: identiteScanGescom(ctx, "lister_reglements", entree.limite, {
      du: entree.du ?? null,
      au: entree.au ?? null,
      non_affectes: entree.non_affectes,
    }),
    filtre,
    projeter,
    ...(entree.curseur !== undefined ? { curseur: entree.curseur } : {}),
  });

  const resultats = resultat.resultats.map((r) => r.objet);
  const avertissements = [...resultat.avertissements];
  let approximatif = resultat.approximatif;
  if (exclusNonAffectesInconnu > 0) {
    approximatif = true;
    avertissements.push(
      `${exclusNonAffectesInconnu} règlement(s) exclu(s) par \`non_affectes\` : montant restant à affecter inconnu.`,
    );
  }

  const bruts = entree.inclure_brut ? resultat.resultats.map((r) => r.source) : null;
  return resultatServiceDepuisScan(ctx, budget.restant, { ...resultat, resultats, approximatif, avertissements }, bruts);
}
