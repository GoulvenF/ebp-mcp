import type { z } from "zod";
import type { Budget } from "../../http/budget.js";
import type { ContexteHttp, DependancesClientHttp } from "../../http/client.js";
import { executerRequetePourRoute } from "../../http/client.js";
import { TauxTvaCptSchema } from "../../domain/schemas/compta.js";
import { montantDepuisSource } from "./lignes.js";
import { lireEnveloppeData } from "./enveloppe.js";
import { erreurEnveloppeInattendueCompta } from "./errors.js";
import { VatRateEbpSchema } from "./schemas-ebp.js";

export type TauxTvaCpt = z.infer<typeof TauxTvaCptSchema>;

export interface ListeTauxTvaCpt {
  readonly resultats: TauxTvaCpt[];
  readonly avertissements: string[];
}

/**
 * `/vat-rate` CPT (02 §2) : `{data:[{designation, rate, isActive, territoriality}]}`, pas de
 * pagination documentée. `territoriality` conservé en chaîne opaque (D-T09-6) : aucune table de
 * mapping CPT n'est prouvée (contrairement à `Territoriality` côté GC, non réutilisable ici).
 */
export async function listerTauxTvaCpt(
  deps: DependancesClientHttp,
  budget: Budget,
  contexte: ContexteHttp,
): Promise<ListeTauxTvaCpt> {
  const corps = await executerRequetePourRoute(deps, budget, contexte, "cpt-vat-rate");
  const enveloppe = lireEnveloppeData("cpt-vat-rate", corps);
  const avertissements: string[] = [];
  const resultats = enveloppe.elements.map((brut): TauxTvaCpt => {
    const resultat = VatRateEbpSchema.safeParse(brut);
    if (!resultat.success) {
      throw erreurEnveloppeInattendueCompta("cpt-vat-rate");
    }
    const source = resultat.data;
    const taux = montantDepuisSource(source.rate, "vat-rate.rate", avertissements);
    const territorialite =
      source.territoriality === null || source.territoriality === undefined
        ? null
        : String(source.territoriality);
    return { designation: source.designation, taux, actif: source.isActive, territorialite };
  });
  return { resultats, avertissements };
}
