import type { Famille } from "../domain/capabilities.js";
import type { Secret } from "../config/secret.js";
import { VERSION } from "../version.js";

/** User-Agent explicite (décision 7, 05 — respect du fournisseur). */
export const USER_AGENT = `ebp-mcp/${VERSION} (+https://github.com/GoulvenF/ebp-mcp)`;

export interface ParametresEntetes {
  readonly accessToken: string;
  readonly subscriptionKey: Secret | null;
  readonly famille: Famille;
  readonly dossierId: string;
}

/**
 * En-têtes construits uniquement après le guard (décision 7, 07 §4) : `tenantid` (CPT) ou
 * `DomainId` (GC), casse exacte de 02. Aucun en-tête n'est construit si le guard a déjà refusé.
 */
export function construireEntetes(params: ParametresEntetes): Record<string, string> {
  const entetes: Record<string, string> = {
    Authorization: `Bearer ${params.accessToken}`,
    Accept: "application/json",
    "Accept-Language": "fr-FR",
    "User-Agent": USER_AGENT,
  };
  if (params.subscriptionKey !== null) {
    entetes["ebp-subscription-key"] = params.subscriptionKey.reveler();
  }
  if (params.famille === "hubbix-compta") {
    entetes["tenantid"] = params.dossierId;
  } else {
    entetes["DomainId"] = params.dossierId;
  }
  return entetes;
}
