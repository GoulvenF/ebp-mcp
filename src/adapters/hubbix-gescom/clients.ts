import type { z } from "zod";
import type { Budget } from "../../http/budget.js";
import type { ContexteHttp, DependancesClientHttp } from "../../http/client.js";
import { executerRequetePourRoute } from "../../http/client.js";
import { decimalDepuisLexeme } from "../../domain/decimal.js";
import { ClientGcSchema } from "../../domain/schemas/gescom.js";
import { lireFiche } from "./enveloppe.js";
import { erreurCapaciteNonSupportee, erreurEnveloppeInattendue } from "./errors.js";
import { ClientEbpSchema } from "./schemas-ebp.js";

export type ClientGc = z.infer<typeof ClientGcSchema>;

/**
 * Lit `/customers/{id}` (02 §3) : fiche par ID direct uniquement. Il n'existe pas de
 * `GET /customers` — aucune route de liste clients n'est déclarée dans le registre de T07, donc
 * aucune reconstitution n'est possible depuis ce module. Forme inattendue ⇒
 * `UPSTREAM_SCHEMA_CHANGED` ; `balanceDue`/`pastDueBalance` conservés en décimaux (jamais `Number`).
 */
export async function lireClient(
  deps: DependancesClientHttp,
  budget: Budget,
  contexte: ContexteHttp,
  id: string,
): Promise<ClientGc> {
  const corps = await executerRequetePourRoute(deps, budget, contexte, "gc-customer-detail", { segments: { id } });
  const fiche = lireFiche("gc-customer-detail", corps);
  const resultat = ClientEbpSchema.safeParse(fiche);
  if (!resultat.success) {
    throw erreurEnveloppeInattendue("gc-customer-detail");
  }
  const source = resultat.data;
  return {
    id,
    code: source.code,
    nom: source.name,
    siret: source.siret,
    numero_tva_intracommunautaire: source.intracommunityVatNumber,
    groupe_id: source.customerGroupId,
    condition_reglement_id: source.settlementTermId,
    solde_du: decimalDepuisLexeme(source.balanceDue),
    solde_echu: decimalDepuisLexeme(source.pastDueBalance),
    devise: null,
  };
}

/**
 * Code client non supporté en v0.1 côté GC (07 §6) : aucune résolution par code n'est possible
 * sans une route de liste/recherche, qui n'existe pas (ni documentée, ni déclarée). Refus avant
 * tout accès réseau — jamais un essai de liste simulée.
 */
export function lireClientParCode(_code: string): never {
  throw erreurCapaciteNonSupportee("fiche_tiers_code_gc");
}
