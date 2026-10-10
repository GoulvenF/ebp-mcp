import type { Budget } from "../../http/budget.js";
import type { ContexteHttp, DependancesClientHttp } from "../../http/client.js";
import { executerRequetePourRoute } from "../../http/client.js";
import { decimalDepuisLexeme } from "../../domain/decimal.js";
import { lireEnveloppeListe } from "./enveloppe.js";
import { erreurEnveloppeInattendue, erreurPaginationInvalide, erreurSkipInvalide, erreurTakeInvalide } from "./errors.js";
import { mapperStatut, mapperStatutComptable, mapperType, type DocumentVente } from "./documents-communs.js";
import { DocumentVenteListeEbpSchema } from "./schemas-ebp.js";

/**
 * Mappe un élément de `/sale-documents` vers le domaine (02 §3, A14) : `tiers_id` reste toujours
 * `null` (le nom client est fourni sans ID sur cette route), `dueAmount` est le reste dû du
 * **document**, distinct du reste dû d'une échéance individuelle (`echeances.ts`). `lignes` reste
 * `null` : la liste ne fournit jamais les lignes d'un document (`documents-detail.ts` pour le
 * détail). Montant d'avoir déjà négatif conservé tel quel, aucune normalisation de signe ici (07
 * §8 réserve ce choix à T11).
 */
function mapperDocumentListeAvecSource(
  brut: unknown,
  avertissements: string[],
): { document: DocumentVente; source: unknown } {
  const resultat = DocumentVenteListeEbpSchema.safeParse(brut);
  if (!resultat.success) {
    throw erreurEnveloppeInattendue("gc-sale-documents");
  }
  const source = resultat.data;
  const { type, avertissement: avertissementType } = mapperType(source.documentType);
  if (avertissementType !== null) avertissements.push(avertissementType);
  const { statut, avertissement: avertissementStatut } = mapperStatut(source.documentStatus);
  if (avertissementStatut !== null) avertissements.push(avertissementStatut);
  const { statut_comptable, avertissement: avertissementComptable } = mapperStatutComptable(
    source.accountingTransferStatus,
  );
  if (avertissementComptable !== null) avertissements.push(avertissementComptable);
  return {
    document: {
      id: source.id,
      type,
      statut,
      tiers_nom: source.name,
      tiers_id: null,
      date: source.date,
      numero: source.number,
      montant_ht: decimalDepuisLexeme(source.totalAmountVatExcluded),
      montant_ttc: decimalDepuisLexeme(source.totalAmountVatIncluded),
      montant_net_ttc: decimalDepuisLexeme(source.netAmountVatIncluded),
      devise: null,
      reste_du: decimalDepuisLexeme(source.dueAmount),
      statut_comptable,
      lignes: null,
    },
    source,
  };
}

/**
 * Mappe un élément de `/sale-documents` vers le domaine (02 §3, A14) : `tiers_id` reste toujours
 * `null` (le nom client est fourni sans ID sur cette route), `dueAmount` est le reste dû du
 * **document**, distinct du reste dû d'une échéance individuelle (`echeances.ts`). `lignes`
 * reste `null` : la liste ne fournit jamais les lignes d'un document (`documents-detail.ts` pour
 * le détail). Montant d'avoir déjà négatif conservé tel quel, aucune normalisation de signe ici
 * (07 §8 réserve ce choix à T11).
 */
function mapperDocumentListe(brut: unknown, avertissements: string[]): DocumentVente {
  return mapperDocumentListeAvecSource(brut, avertissements).document;
}

function validerSkipTake(skip: number, take: number): void {
  if (!Number.isInteger(take) || take < 1 || take > 100) {
    throw erreurTakeInvalide(take);
  }
  if (!Number.isInteger(skip) || skip < 0) {
    throw erreurSkipInvalide(skip);
  }
}

export interface RequeteListeDocuments {
  readonly skip: number;
  readonly take: number;
}

/** Page `/sale-documents` normalisée : aucune boucle de pagination, aucun filtre conjectural (02 §3). */
export interface PageDocuments {
  readonly resultats: DocumentVente[];
  readonly total_source: number | null;
  readonly renvoyes: number;
  readonly skip_demande: number;
  readonly skip_renvoye: number;
  readonly avertissements: string[];
  /** Éléments source validés, alignés 1:1 avec `resultats` (D-T11-14, extension additive). */
  readonly sourcesEbp: unknown[];
}

/**
 * Lit une page de `/sale-documents` (02 §3). Aucun filtre date/type/client n'existe sur cette
 * route (seulement `filter.query`, non démontré) : aucun paramètre conjectural envoyé.
 */
export async function listerDocumentsVente(
  deps: DependancesClientHttp,
  budget: Budget,
  contexte: ContexteHttp,
  requete: RequeteListeDocuments,
): Promise<PageDocuments> {
  validerSkipTake(requete.skip, requete.take);
  const corps = await executerRequetePourRoute(deps, budget, contexte, "gc-sale-documents", {
    parametres: { skip: requete.skip, take: requete.take },
  });
  const enveloppe = lireEnveloppeListe("gc-sale-documents", corps, requete.skip);
  if (enveloppe.skipRenvoye !== requete.skip) {
    throw erreurPaginationInvalide("gc-sale-documents", requete.skip, enveloppe.skipRenvoye);
  }
  const avertissements: string[] = [];
  const sourcesEbp: unknown[] = [];
  const resultats = enveloppe.elements.map((brut) => {
    const { document, source } = mapperDocumentListeAvecSource(brut, avertissements);
    sourcesEbp.push(source);
    return document;
  });
  return {
    resultats,
    total_source: enveloppe.totalSource,
    renvoyes: resultats.length,
    skip_demande: requete.skip,
    skip_renvoye: enveloppe.skipRenvoye,
    avertissements,
    sourcesEbp,
  };
}
