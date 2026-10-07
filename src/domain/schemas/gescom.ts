import { z } from "zod";
import { DateCivileSchema, DecimalStringSchema } from "./commun.js";

/** `/items` (02 §3) ; `priceVatExcluded`/`priceVatIncluded` conservent leur précision source. */
export const ArticleSchema = z.object({
  id: z.string(),
  code: z.string(),
  libelle: z.string().nullable(),
  type: z.enum(["bien", "service", "inconnu"]),
  prix_ht: DecimalStringSchema.nullable(),
  prix_ttc: DecimalStringSchema.nullable(),
  taux_tva: DecimalStringSchema.nullable(),
  actif: z.boolean().nullable(),
});

/** Ligne d'un document de vente (`/sale-invoices/{id}` etc., 02 §3, champs non détaillés par 02). */
export const LigneDocumentSchema = z.object({
  id: z.string().nullable(),
  designation: z.string().nullable(),
  quantite: DecimalStringSchema.nullable(),
  prix_unitaire_ht: DecimalStringSchema.nullable(),
  montant_ht: DecimalStringSchema.nullable(),
  taux_tva: DecimalStringSchema.nullable(),
});

/** `/sale-documents` + détail (02 §3) ; `tiers_id` absent de la liste, donc `nullable()`. */
export const DocumentVenteSchema = z.object({
  id: z.string(),
  type: z.enum([
    "SaleInvoice",
    "SaleCredit",
    "SaleDepositInvoice",
    "SaleDepositCredit",
    "SaleQuote",
    "inconnu",
  ]),
  statut: z.enum(["provisoire", "valide", "inconnu"]),
  tiers_nom: z.string().nullable(),
  tiers_id: z.string().nullable(),
  date: DateCivileSchema.nullable(),
  numero: z.string().nullable(),
  montant_ht: DecimalStringSchema.nullable(),
  montant_ttc: DecimalStringSchema.nullable(),
  montant_net_ttc: DecimalStringSchema.nullable(),
  reste_du: DecimalStringSchema.nullable(),
  statut_comptable: z.enum(["sent_for_accounting", "accounted", "entry_generation_failure", "inconnu"]).nullable(),
  lignes: z.array(LigneDocumentSchema).nullable(),
});

/** `/sale-commitments` (échéances, 02 §3). */
export const EcheanceSchema = z.object({
  id: z.string(),
  date: DateCivileSchema.nullable(),
  tiers_id: z.string().nullable(),
  tiers_nom: z.string().nullable(),
  tiers_code: z.string().nullable(),
  document_id: z.string().nullable(),
  document_numero: z.string().nullable(),
  document_type: z.string().nullable(),
  document_statut: z.string().nullable(),
  mode_paiement: z.string().nullable(),
  montant: DecimalStringSchema.nullable(),
  reste_du: DecimalStringSchema.nullable(),
});

/** `/settlements` (règlements, 02 §3) : tiers conservé par nom seul, ID non fourni par la source. */
export const ReglementSchema = z.object({
  code: z.string().nullable(),
  date: DateCivileSchema.nullable(),
  tiers_nom: z.string().nullable(),
  tiers_id: z.null(),
  montant: DecimalStringSchema.nullable(),
  montant_restant_a_affecter: DecimalStringSchema.nullable(),
  mode_paiement_libelle: z.string().nullable(),
  reference: z.string().nullable(),
  type: z.enum(["encaissement", "remboursement", "inconnu"]).nullable(),
});
