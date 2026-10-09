import { erreurCapaciteNonSupportee } from "./errors.js";

/** `SaleDocumentType` (02 §3) : seules les cinq valeurs documentées sont routables. */
export const TYPES_DOCUMENT_CONNUS = [
  "SaleInvoice",
  "SaleCredit",
  "SaleQuote",
  "SaleDepositInvoice",
  "SaleDepositCredit",
] as const;
export type TypeDocumentSource = (typeof TYPES_DOCUMENT_CONNUS)[number];

/** `SaleDocumentStatus` (02 §3) : `Provisional = 0`, `Validated = 1`. */
export const STATUTS_DOCUMENT_CONNUS = [0, 1] as const;
export type StatutDocumentSource = (typeof STATUTS_DOCUMENT_CONNUS)[number];

export type RouteDetailDocument =
  | "gc-sale-invoice-detail"
  | "gc-sale-invoice-validated-detail"
  | "gc-sale-credit-detail"
  | "gc-sale-credit-validated-detail"
  | "gc-sale-quote-detail"
  | "gc-sale-quote-invoiced-detail"
  | "gc-sale-deposit-invoice-detail"
  | "gc-sale-deposit-credit-detail";

/**
 * Table exhaustive de routage document (fiche T10b, plan GOU-272). Les acomptes (`Validated`
 * compris) n'ont qu'une seule route documentée : aucune variante `validated` n'existe pour
 * `SaleDepositInvoice`/`SaleDepositCredit`, ne pas en inventer une.
 */
const TABLE_ROUTAGE: Readonly<Record<TypeDocumentSource, Readonly<Record<StatutDocumentSource, RouteDetailDocument>>>> = {
  SaleInvoice: { 0: "gc-sale-invoice-detail", 1: "gc-sale-invoice-validated-detail" },
  SaleCredit: { 0: "gc-sale-credit-detail", 1: "gc-sale-credit-validated-detail" },
  SaleQuote: { 0: "gc-sale-quote-detail", 1: "gc-sale-quote-invoiced-detail" },
  SaleDepositInvoice: { 0: "gc-sale-deposit-invoice-detail", 1: "gc-sale-deposit-invoice-detail" },
  SaleDepositCredit: { 0: "gc-sale-deposit-credit-detail", 1: "gc-sale-deposit-credit-detail" },
};

/** Cite la valeur source sans la requalifier : une valeur absente n'est jamais confondue avec `null`. */
function citerValeur(valeur: unknown): string {
  return valeur === undefined ? "absente" : JSON.stringify(valeur);
}

function estTypeDocumentConnu(valeur: unknown): valeur is TypeDocumentSource {
  return typeof valeur === "string" && (TYPES_DOCUMENT_CONNUS as readonly string[]).includes(valeur);
}

function estStatutDocumentConnu(valeur: unknown): valeur is StatutDocumentSource {
  return typeof valeur === "number" && (STATUTS_DOCUMENT_CONNUS as readonly number[]).includes(valeur);
}

/**
 * Résout la route de détail à partir de `documentType`/`documentStatus` (07 §5/§6, A13). Donnée
 * nécessaire au routage inconnue (type ou statut hors énumération, ou absente) ⇒
 * `UNSUPPORTED_CAPABILITY` **avant tout appel réseau** ; distingue un champ absent d'une valeur
 * présente mais hors énumération, et cite la valeur source sans la requalifier. Un `404` sur la
 * route résolue n'est jamais rattrapé par une tentative sur une autre route (A13, 07 §6) : cette
 * fonction ne fait que résoudre l'identifiant de route, elle n'émet aucune requête.
 */
export function resoudreRouteDetail(documentType: unknown, documentStatus: unknown): RouteDetailDocument {
  if (!estTypeDocumentConnu(documentType)) {
    throw erreurCapaciteNonSupportee(`documentType ${citerValeur(documentType)} non pris en charge pour le routage`);
  }
  if (!estStatutDocumentConnu(documentStatus)) {
    throw erreurCapaciteNonSupportee(`documentStatus ${citerValeur(documentStatus)} non pris en charge pour le routage`);
  }
  return TABLE_ROUTAGE[documentType][documentStatus];
}
