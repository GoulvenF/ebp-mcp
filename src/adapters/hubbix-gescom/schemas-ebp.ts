import { z } from "zod";

/**
 * Schémas wrappers EBP (02 §3), distincts des schémas de domaine (`src/domain/schemas/gescom.ts`).
 * Champs exactement ceux documentés ; aucun champ conjectural. Validés avant tout mapping :
 * un champ documenté manquant fait échouer le `safeParse` et déclenche `UPSTREAM_SCHEMA_CHANGED`
 * côté appelant, plutôt qu'une valeur inventée.
 */

/** Élément de `/items` et fiche `/items/goods/{id}` | `/items/services/{id}` (02 §3). */
export const ArticleEbpSchema = z.object({
  id: z.string(),
  code: z.string(),
  label: z.string().nullable(),
  itemType: z.string().nullable(),
  priceVatExcluded: z.string().nullable(),
  priceVatIncluded: z.string().nullable(),
  vatRate: z.string().nullable(),
  itemStatus: z.number().nullable(),
});

/** Élément du tableau nu `/vat-rates` (02 §3). */
export const TauxTvaEbpSchema = z.object({
  label: z.string().nullable(),
  rate: z.string().nullable(),
  territoriality: z.number().nullable(),
  isDefault: z.boolean().nullable(),
});

/** Fiche `/customers/{id}` (02 §3) ; pas de `GET /customers` (liste) à ce niveau. */
export const ClientEbpSchema = z.object({
  code: z.string().nullable(),
  name: z.string().nullable(),
  siret: z.string().nullable(),
  intracommunityVatNumber: z.string().nullable(),
  customerGroupId: z.string().nullable(),
  settlementTermId: z.string().nullable(),
  balanceDue: z.string().nullable(),
  pastDueBalance: z.string().nullable(),
});
