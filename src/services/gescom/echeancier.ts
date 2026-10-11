import type { Echeance } from "../../adapters/hubbix-gescom/echeances.js";
import { listerEcheances } from "../../adapters/hubbix-gescom/echeances.js";
import { creerBudget } from "../../http/budget.js";
import { aujourdHuiParis, estEnRetard, joursCivilsEntre, joursRetard } from "../../domain/date.js";
import { scanner } from "../../pagination/scan.js";
import { EcheancierClientsEntreeSchema, validerEntree } from "../commun/entrees.js";
import { verifierCapacitesEntree } from "../commun/capacites.js";
import { exigerFamilleOutil, type ContexteService, type DepsService, type ResultatService } from "../commun/types.js";
import { identiteScanGescom } from "./identite.js";
import { resultatServiceDepuisScan } from "./resultats.js";
import { sourceDepuisSkipTakeAvecSource, type ElementAvecSource } from "./sources.js";

/** Échéance enrichie des deux champs de retard calculés (D-T11-9, 07 §8). */
export interface EcheanceAvecRetard extends Echeance {
  readonly en_retard: boolean | null;
  readonly jours_retard: number | null;
}

/**
 * `echeancier_clients` (07 §8, D-T11-9). Seuls `skip`/`take` partent au serveur
 * (`/sale-commitments`) ; `du`/`au`/`tiers`/`en_retard_seulement` sont des filtres locaux après
 * scan. `aujourdHuiParis(clock)` est capturé une seule fois par appel. Date d'échéance absente ⇒
 * `en_retard`/`jours_retard` à `null`, avec avertissement. Aucune somme.
 */
export async function echeancierClients(
  deps: DepsService,
  ctx: ContexteService,
  entreeBrute: unknown,
): Promise<ResultatService<EcheanceAvecRetard>> {
  const entree = validerEntree(EcheancierClientsEntreeSchema, entreeBrute, "echeancier_clients");
  exigerFamilleOutil("echeancier_clients", ctx);
  verifierCapacitesEntree("echeancier_clients", ctx.dossier.famille, entree);

  const budget = creerBudget(ctx.execution);
  const aujourdHui = aujourdHuiParis(deps.clock);
  let exclusEnRetardInconnu = 0;

  const source = sourceDepuisSkipTakeAvecSource<Echeance>(
    "hubbix-gescom:/sale-commitments",
    "transactionnel",
    100,
    (echeance) => echeance.id,
    async (skip, take, b) => {
      const page = await listerEcheances(deps.http, b, ctx.http, { skip, take });
      return {
        resultats: page.resultats,
        total_source: page.total_source,
        renvoyes: page.renvoyes,
        skip_renvoye: page.skip_renvoye,
        sourcesEbp: page.sourcesEbp,
      };
    },
  );

  const filtre = (element: ElementAvecSource<Echeance>): boolean => {
    const echeance = element.objet;
    if (entree.du !== undefined && (echeance.date === null || joursCivilsEntre(entree.du, echeance.date) < 0)) return false;
    if (entree.au !== undefined && (echeance.date === null || joursCivilsEntre(echeance.date, entree.au) < 0)) return false;
    if (entree.tiers !== undefined && echeance.tiers_id !== entree.tiers) return false;
    if (entree.en_retard_seulement) {
      const enRetard = estEnRetard(echeance.reste_du, echeance.date, aujourdHui);
      if (enRetard === null) {
        exclusEnRetardInconnu += 1;
        return false;
      }
      if (!enRetard) return false;
    }
    return true;
  };

  const projeter = (element: ElementAvecSource<Echeance>): { objet: EcheanceAvecRetard; source: unknown } => {
    const echeance = element.objet;
    return {
      objet: {
        ...echeance,
        en_retard: estEnRetard(echeance.reste_du, echeance.date, aujourdHui),
        jours_retard: joursRetard(aujourdHui, echeance.date),
      },
      source: element.source,
    };
  };

  const resultat = await scanner<ElementAvecSource<Echeance>, { objet: EcheanceAvecRetard; source: unknown }>(deps.scan, {
    contexte: ctx.execution,
    budget,
    source,
    limite: entree.limite,
    identite: identiteScanGescom(ctx, "echeancier_clients", entree.limite, {
      du: entree.du ?? null,
      au: entree.au ?? null,
      tiers: entree.tiers ?? null,
      en_retard_seulement: entree.en_retard_seulement,
    }),
    filtre,
    projeter,
    ...(entree.curseur !== undefined ? { curseur: entree.curseur } : {}),
  });

  const resultats = resultat.resultats.map((r) => r.objet);
  const avertissements = [...resultat.avertissements];
  const renduesSansDate = resultats.filter((e) => e.date === null).length;
  if (renduesSansDate > 0) {
    avertissements.push(`${renduesSansDate} échéance(s) sans date : \`en_retard\`/\`jours_retard\` à \`null\`.`);
  }
  if (exclusEnRetardInconnu > 0) {
    avertissements.push(
      `${exclusEnRetardInconnu} échéance(s) exclue(s) par \`en_retard_seulement\` : retard indéterminable (date ou reste dû absent).`,
    );
  }

  const bruts = entree.inclure_brut ? resultat.resultats.map((r) => r.source) : null;
  return resultatServiceDepuisScan(ctx, budget.restant, { ...resultat, resultats, avertissements }, bruts);
}
