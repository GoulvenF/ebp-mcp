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

/** Élément de `/sale-documents` (liste, 02 §3) ; `tiers_id` n'existe pas sur cette route (A14). */
export const DocumentVenteListeEbpSchema = z.object({
  id: z.string(),
  documentType: z.unknown().optional(),
  documentStatus: z.unknown().optional(),
  name: z.string().nullable(),
  date: z.string().nullable(),
  number: z.string().nullable(),
  totalAmountVatExcluded: z.string().nullable(),
  totalAmountVatIncluded: z.string().nullable(),
  netAmountVatIncluded: z.string().nullable(),
  dueAmount: z.string().nullable(),
  accountingTransferStatus: z.unknown().optional(),
});

/** Échéance d'un document, imbriquée dans une fiche de détail (`commitments[]`, 02 §3). */
export const EcheanceDocumentEbpSchema = z.object({
  date: z.string().nullable(),
  amount: z.string().nullable(),
  remainingAmount: z.string().nullable(),
  paymentModeId: z.unknown().optional(),
});

/**
 * En-tête commun des 8 routes de détail `/sale-invoices`, `/sale-credits`, `/sale-quotes`,
 * `/sale-deposit-invoices`, `/sale-deposit-credits` (02 §3). `lines`, `footer` et
 * `vatSummaryLines` ont une forme interne non documentée par 02 (seul le nom du champ est cité) :
 * transmis sans validation de champ interne, pour ne pas inventer un mapping non prouvé.
 */
export const DocumentDetailEbpSchema = z.object({
  id: z.string(),
  documentType: z.unknown().optional(),
  documentStatus: z.unknown().optional(),
  name: z.string().nullable(),
  date: z.string().nullable(),
  number: z.string().nullable(),
  totalAmountVatExcluded: z.string().nullable(),
  totalAmountVatIncluded: z.string().nullable(),
  netAmountVatIncluded: z.string().nullable(),
  dueAmount: z.string().nullable(),
  accountingTransferStatus: z.unknown().optional(),
  customerId: z.string().nullable(),
  commitments: z.array(EcheanceDocumentEbpSchema).nullable(),
  lines: z.array(z.unknown()).nullable(),
  footer: z.unknown().nullable(),
  vatSummaryLines: z.array(z.unknown()).nullable(),
});

/** `/sale-quotes/{id}` et `/sale-quotes/invoiced/{id}` : en-tête commun + `validUntil` (02 §3). */
export const DevisDetailEbpSchema = DocumentDetailEbpSchema.extend({
  validUntil: z.string().nullable(),
});

/**
 * `/sale-deposit-invoices/{id}` et `/sale-deposit-credits/{id}` (02 §3) : 02 cite un jeu de
 * champs propre aux acomptes (`amountVatIncluded`, `remainingAmount`, `lateAmount`), distinct des
 * totaux de l'en-tête commun (`totalAmountVatExcluded`/`dueAmount`, non cités pour ces deux
 * routes) — pas de fusion des deux jeux de champs, pour ne pas inventer une présence non
 * documentée.
 */
export const AcompteDetailEbpSchema = z.object({
  id: z.string(),
  documentType: z.unknown().optional(),
  documentStatus: z.unknown().optional(),
  name: z.string().nullable(),
  date: z.string().nullable(),
  number: z.string().nullable(),
  accountingTransferStatus: z.unknown().optional(),
  customerId: z.string().nullable(),
  commitments: z.array(EcheanceDocumentEbpSchema).nullable(),
  lines: z.array(z.unknown()).nullable(),
  footer: z.unknown().nullable(),
  vatSummaryLines: z.array(z.unknown()).nullable(),
  amountVatIncluded: z.string().nullable(),
  remainingAmount: z.string().nullable(),
  lateAmount: z.string().nullable(),
});

/** Élément de `/sale-commitments` (échéancier, 02 §3). */
export const EcheanceEbpSchema = z.object({
  id: z.string(),
  date: z.string().nullable(),
  customer: z
    .object({
      id: z.string().nullable(),
      name: z.string().nullable(),
      code: z.string().nullable(),
    })
    .nullable(),
  document: z
    .object({
      id: z.string().nullable(),
      number: z.string().nullable(),
      documentType: z.unknown().optional(),
      documentStatus: z.unknown().optional(),
    })
    .nullable(),
  paymentMode: z.string().nullable(),
  amount: z.string().nullable(),
  remainingAmount: z.string().nullable(),
});

/** Élément de `/settlements` (règlements, 02 §3) ; `tiers_id` n'existe pas sur cette route (A14). */
export const ReglementEbpSchema = z.object({
  code: z.string().nullable(),
  date: z.string().nullable(),
  customerName: z.string().nullable(),
  amount: z.string().nullable(),
  stillToBeDistributedAmount: z.string().nullable(),
  paymentModeLabel: z.string().nullable(),
  paymentReference: z.string().nullable(),
  settlementType: z.unknown().optional(),
});
