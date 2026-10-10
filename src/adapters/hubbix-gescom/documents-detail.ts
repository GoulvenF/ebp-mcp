import type { Budget } from "../../http/budget.js";
import type { ContexteHttp, DependancesClientHttp } from "../../http/client.js";
import { executerRequetePourRoute } from "../../http/client.js";
import { decimalDepuisLexeme } from "../../domain/decimal.js";
import { mapperStatut, mapperStatutComptable, mapperType, type DocumentVente } from "./documents-communs.js";
import { erreurEnveloppeInattendue } from "./errors.js";
import { lireFiche } from "./enveloppe.js";
import { resoudreRouteDetail, type RouteDetailDocument } from "./routage.js";
import { AcompteDetailEbpSchema, DevisDetailEbpSchema, DocumentDetailEbpSchema } from "./schemas-ebp.js";

/** Échéance d'un document, telle que renvoyée dans `commitments[]` d'une fiche de détail (02 §3). */
export interface EcheanceDocumentDetail {
  readonly date: string | null;
  readonly montant: string | null;
  readonly reste_du: string | null;
  readonly mode_paiement_id: string | null;
}

/**
 * Fiche de détail d'un document de vente (02 §3). `lignes`, `pied` et `recapitulatif_tva`
 * reprennent `lines`/`footer`/`vatSummaryLines` sans transformation : 02 ne documente que le nom
 * de ces champs, pas leur forme interne — aucun mapping de champ n'y est inventé (07 §1). Seuls
 * les devis portent `date_validite` ; seuls les acomptes portent `montant_en_retard` — `null`
 * ailleurs, jamais une valeur par défaut inventée.
 */
export interface DetailDocumentVente {
  readonly id: string;
  readonly type: DocumentVente["type"];
  readonly statut: DocumentVente["statut"];
  readonly tiers_id: string | null;
  readonly tiers_nom: string | null;
  readonly date: string | null;
  readonly numero: string | null;
  readonly montant_ht: string | null;
  readonly montant_ttc: string | null;
  readonly montant_net_ttc: string | null;
  readonly devise: string | null;
  readonly reste_du: string | null;
  readonly statut_comptable: DocumentVente["statut_comptable"];
  readonly lignes: unknown[] | null;
  readonly pied: unknown | null;
  readonly recapitulatif_tva: unknown[] | null;
  readonly echeances: EcheanceDocumentDetail[] | null;
  readonly date_validite: string | null;
  readonly montant_en_retard: string | null;
}

export interface FicheDocumentVente {
  readonly resultat: DetailDocumentVente;
  readonly avertissements: string[];
}

function idOpaque(valeur: unknown): string | null {
  if (typeof valeur === "string") return valeur;
  if (typeof valeur === "number") return String(valeur);
  return null;
}

function mapperEcheanceDocument(brut: unknown): EcheanceDocumentDetail {
  const objet = brut as { date: string | null; amount: string | null; remainingAmount: string | null; paymentModeId: unknown };
  return {
    date: objet.date,
    montant: decimalDepuisLexeme(objet.amount),
    reste_du: decimalDepuisLexeme(objet.remainingAmount),
    mode_paiement_id: idOpaque(objet.paymentModeId),
  };
}

function mapperDetailCommun(
  source: {
    id: string;
    documentType?: unknown;
    documentStatus?: unknown;
    name: string | null;
    date: string | null;
    number: string | null;
    totalAmountVatExcluded: string | null;
    totalAmountVatIncluded: string | null;
    netAmountVatIncluded: string | null;
    dueAmount: string | null;
    accountingTransferStatus?: unknown;
    customerId: string | null;
    commitments: readonly unknown[] | null;
    lines: readonly unknown[] | null;
    footer: unknown;
    vatSummaryLines: readonly unknown[] | null;
  },
  avertissements: string[],
): Omit<DetailDocumentVente, "date_validite" | "montant_en_retard"> {
  const { type, avertissement: avertissementType } = mapperType(source.documentType);
  if (avertissementType !== null) avertissements.push(avertissementType);
  const { statut, avertissement: avertissementStatut } = mapperStatut(source.documentStatus);
  if (avertissementStatut !== null) avertissements.push(avertissementStatut);
  const { statut_comptable, avertissement: avertissementComptable } = mapperStatutComptable(
    source.accountingTransferStatus,
  );
  if (avertissementComptable !== null) avertissements.push(avertissementComptable);
  return {
    id: source.id,
    type,
    statut,
    tiers_id: source.customerId,
    tiers_nom: source.name,
    date: source.date,
    numero: source.number,
    montant_ht: decimalDepuisLexeme(source.totalAmountVatExcluded),
    montant_ttc: decimalDepuisLexeme(source.totalAmountVatIncluded),
    montant_net_ttc: decimalDepuisLexeme(source.netAmountVatIncluded),
    devise: null,
    reste_du: decimalDepuisLexeme(source.dueAmount),
    statut_comptable,
    lignes: source.lines !== null ? [...source.lines] : null,
    pied: source.footer ?? null,
    recapitulatif_tva: source.vatSummaryLines !== null ? [...source.vatSummaryLines] : null,
    echeances: source.commitments !== null ? source.commitments.map(mapperEcheanceDocument) : null,
  };
}

async function lireDetailDocument(
  deps: DependancesClientHttp,
  budget: Budget,
  contexte: ContexteHttp,
  routeId: RouteDetailDocument,
  id: string,
): Promise<FicheDocumentVente> {
  const corps = await executerRequetePourRoute(deps, budget, contexte, routeId, { segments: { id } });
  const fiche = lireFiche(routeId, corps);
  const resultat = DocumentDetailEbpSchema.safeParse(fiche);
  if (!resultat.success) {
    throw erreurEnveloppeInattendue(routeId);
  }
  const avertissements: string[] = [];
  const commun = mapperDetailCommun(resultat.data, avertissements);
  return { resultat: { ...commun, date_validite: null, montant_en_retard: null }, avertissements };
}

async function lireDetailDevis(
  deps: DependancesClientHttp,
  budget: Budget,
  contexte: ContexteHttp,
  routeId: "gc-sale-quote-detail" | "gc-sale-quote-invoiced-detail",
  id: string,
): Promise<FicheDocumentVente> {
  const corps = await executerRequetePourRoute(deps, budget, contexte, routeId, { segments: { id } });
  const fiche = lireFiche(routeId, corps);
  const resultat = DevisDetailEbpSchema.safeParse(fiche);
  if (!resultat.success) {
    throw erreurEnveloppeInattendue(routeId);
  }
  const avertissements: string[] = [];
  const commun = mapperDetailCommun(resultat.data, avertissements);
  return { resultat: { ...commun, date_validite: resultat.data.validUntil, montant_en_retard: null }, avertissements };
}

/**
 * Détail d'un acompte (facture ou avoir) : 02 cite `amountVatIncluded`/`remainingAmount` à la
 * place des totaux de l'en-tête commun (`totalAmountVatIncluded`/`dueAmount`, non documentés pour
 * ces deux routes) — `montant_ht` reste `null`, faute de `totalAmountVatExcluded` documenté ici.
 */
async function lireDetailAcompte(
  deps: DependancesClientHttp,
  budget: Budget,
  contexte: ContexteHttp,
  routeId: "gc-sale-deposit-invoice-detail" | "gc-sale-deposit-credit-detail",
  id: string,
): Promise<FicheDocumentVente> {
  const corps = await executerRequetePourRoute(deps, budget, contexte, routeId, { segments: { id } });
  const fiche = lireFiche(routeId, corps);
  const resultat = AcompteDetailEbpSchema.safeParse(fiche);
  if (!resultat.success) {
    throw erreurEnveloppeInattendue(routeId);
  }
  const source = resultat.data;
  const avertissements: string[] = [];
  const { type, avertissement: avertissementType } = mapperType(source.documentType);
  if (avertissementType !== null) avertissements.push(avertissementType);
  const { statut, avertissement: avertissementStatut } = mapperStatut(source.documentStatus);
  if (avertissementStatut !== null) avertissements.push(avertissementStatut);
  const { statut_comptable, avertissement: avertissementComptable } = mapperStatutComptable(
    source.accountingTransferStatus,
  );
  if (avertissementComptable !== null) avertissements.push(avertissementComptable);
  return {
    resultat: {
      id: source.id,
      type,
      statut,
      tiers_id: source.customerId,
      tiers_nom: source.name,
      date: source.date,
      numero: source.number,
      montant_ht: null,
      montant_ttc: decimalDepuisLexeme(source.amountVatIncluded),
      montant_net_ttc: decimalDepuisLexeme(source.amountVatIncluded),
      devise: null,
      reste_du: decimalDepuisLexeme(source.remainingAmount),
      statut_comptable,
      lignes: source.lines !== null ? [...source.lines] : null,
      pied: source.footer ?? null,
      recapitulatif_tva: source.vatSummaryLines !== null ? [...source.vatSummaryLines] : null,
      echeances: source.commitments !== null ? source.commitments.map(mapperEcheanceDocument) : null,
      date_validite: null,
      montant_en_retard: decimalDepuisLexeme(source.lateAmount),
    },
    avertissements,
  };
}

/**
 * Résout puis lit le détail d'un document de vente (07 §5/§6, A13). `documentType`/`documentStatus`
 * doivent venir d'une référence déjà connue (p. ex. un résultat de `listerDocumentsVente`) : type
 * ou statut inconnu ⇒ `UNSUPPORTED_CAPABILITY` avant tout appel réseau, exactement comme
 * `resoudreRouteDetail`. Un `404` sur la route résolue est renvoyé tel quel (`NOT_FOUND`), sans
 * aucun essai sur une autre route de détail (A13).
 */
export async function lireDetailDocumentVente(
  deps: DependancesClientHttp,
  budget: Budget,
  contexte: ContexteHttp,
  documentType: unknown,
  documentStatus: unknown,
  id: string,
): Promise<FicheDocumentVente> {
  const routeId = resoudreRouteDetail(documentType, documentStatus);
  switch (routeId) {
    case "gc-sale-quote-detail":
    case "gc-sale-quote-invoiced-detail":
      return lireDetailDevis(deps, budget, contexte, routeId, id);
    case "gc-sale-deposit-invoice-detail":
    case "gc-sale-deposit-credit-detail":
      return lireDetailAcompte(deps, budget, contexte, routeId, id);
    default:
      return lireDetailDocument(deps, budget, contexte, routeId, id);
  }
}
