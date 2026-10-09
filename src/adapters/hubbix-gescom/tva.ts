import type { z } from "zod";
import type { Budget } from "../../http/budget.js";
import type { ContexteHttp, DependancesClientHttp } from "../../http/client.js";
import { executerRequetePourRoute } from "../../http/client.js";
import { decimalDepuisLexeme } from "../../domain/decimal.js";
import { interpreterEnum } from "../../domain/enum.js";
import { TauxTvaSchema } from "../../domain/schemas/gescom.js";
import { lireEnveloppeTableauNu } from "./enveloppe.js";
import { erreurEnveloppeInattendue } from "./errors.js";
import { TauxTvaEbpSchema } from "./schemas-ebp.js";

export type TauxTva = z.infer<typeof TauxTvaSchema>;

/** `Territoriality` (02 §3), codée en chaîne pour réutiliser `interpreterEnum`. */
const CODES_TERRITORIALITE = ["0", "1", "2", "3", "4", "5", "6"] as const;
const LABELS_TERRITORIALITE: Readonly<Record<(typeof CODES_TERRITORIALITE)[number], TauxTva["territorialite"]>> = {
  "0": "france",
  "1": "corse",
  "2": "dom",
  "3": "import_export",
  "4": "intracommunautaire",
  "5": "monaco",
  "6": "hors_france",
};

function mapperTerritorialite(territoriality: unknown): {
  territorialite: TauxTva["territorialite"];
  avertissement: string | null;
} {
  const brut = typeof territoriality === "number" ? String(territoriality) : null;
  const resultat = interpreterEnum(brut, CODES_TERRITORIALITE);
  if (resultat.valeur === "inconnu") {
    return { territorialite: "inconnu", avertissement: resultat.avertissement };
  }
  return { territorialite: LABELS_TERRITORIALITE[resultat.valeur], avertissement: null };
}

export interface ListeTauxTva {
  readonly resultats: TauxTva[];
  readonly avertissements: string[];
}

/**
 * Lit `/vat-rates` (02 §3), tableau nu sans pagination : référentiel complet en un seul appel.
 * Forme inattendue ⇒ `UPSTREAM_SCHEMA_CHANGED` ; `territoriality` inconnue ⇒ `inconnu` +
 * avertissement citant la valeur source, jamais un taux par défaut inventé.
 */
export async function listerTauxTva(
  deps: DependancesClientHttp,
  budget: Budget,
  contexte: ContexteHttp,
): Promise<ListeTauxTva> {
  const corps = await executerRequetePourRoute(deps, budget, contexte, "gc-vat-rates");
  const tableau = lireEnveloppeTableauNu("gc-vat-rates", corps);
  const avertissements: string[] = [];
  const resultats = tableau.map((brut): TauxTva => {
    const resultat = TauxTvaEbpSchema.safeParse(brut);
    if (!resultat.success) {
      throw erreurEnveloppeInattendue("gc-vat-rates");
    }
    const source = resultat.data;
    const { territorialite, avertissement } = mapperTerritorialite(source.territoriality);
    if (avertissement !== null) avertissements.push(avertissement);
    return {
      libelle: source.label,
      taux: decimalDepuisLexeme(source.rate),
      territorialite,
      defaut: source.isDefault,
    };
  });
  return { resultats, avertissements };
}
