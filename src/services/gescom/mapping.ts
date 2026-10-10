import type { TypeDocumentSource } from "../../adapters/hubbix-gescom/routage.js";
import type { DocumentVente } from "../../adapters/hubbix-gescom/documents-communs.js";
import { erreurCapaciteNonSupporteeService } from "../commun/erreurs.js";

/**
 * Correspondance type document entrée (07 §6, `TypeDocumentVenteEntreeSchema`) ↔ type source EBP
 * (D-T11-7). Seuls les cinq types déjà routables par `resoudreRouteDetail` (`adapters/hubbix-gescom/
 * routage.ts`) figurent ici ; les six types du catalogue v1 restants sont refusés avant réseau par
 * `verifierCapacitesEntree` (D-T11-6), jamais traduits ici.
 */
export const TYPE_ENTREE_VERS_SOURCE: Readonly<Record<string, TypeDocumentSource>> = {
  facture: "SaleInvoice",
  avoir: "SaleCredit",
  facture_acompte: "SaleDepositInvoice",
  avoir_acompte: "SaleDepositCredit",
  devis: "SaleQuote",
};

/** Inverse de `TYPE_ENTREE_VERS_SOURCE`, pour filtrer les résultats d'une liste par type entrée. */
export const TYPE_SOURCE_VERS_ENTREE: ReadonlyMap<TypeDocumentSource, string> = new Map(
  Object.entries(TYPE_ENTREE_VERS_SOURCE).map(([entree, source]) => [source, entree]),
);

/**
 * Statut entrée (`provisoire|valide|facture`) ↔ `documentStatus` numérique source (D-T11-7).
 * `facture` n'a de sens que pour `devis` (contrôlé par le schéma d'entrée,
 * `exigerCoherenceTypeStatutDocuments`/`exigerCoherenceReferenceDocument`) mais partage le même
 * code numérique `1` que `valide` : un devis « facturé » est un devis dont `documentStatus = 1`,
 * exactement comme un document « validé » pour les autres types — ce n'est pas une troisième
 * valeur source, seulement un autre nom pour le même état selon le type.
 */
export const STATUT_ENTREE_VERS_NUMERIQUE: Readonly<Record<string, 0 | 1>> = {
  provisoire: 0,
  valide: 1,
  facture: 1,
};

/**
 * Statut entrée ↔ statut domaine déjà mappé par `mapperStatut` (`documents-communs.ts`,
 * `provisoire|valide|inconnu`) : même correspondance numérique que ci-dessus, vue côté domaine
 * plutôt que source, pour filtrer localement une page déjà mappée sans refaire d'appel réseau.
 */
export function statutEntreeVersDomaine(statutEntree: string): DocumentVente["statut"] {
  return STATUT_ENTREE_VERS_NUMERIQUE[statutEntree] === 1 ? "valide" : "provisoire";
}

/**
 * Résout `documentType`/`documentStatus` source à partir d'une référence `{type, statut}` de
 * `detail_document` (07 §6, D-T11-7) : exclusivement les cinq types connus, jamais une valeur
 * conjecturale. Les combinaisons type/statut contradictoires sont déjà refusées par le schéma
 * d'entrée (`exigerCoherenceReferenceDocument`) avant d'atteindre cette fonction.
 */
export function resoudreTypeStatutSourceDepuisReference(type: string, statut: string): {
  documentType: TypeDocumentSource;
  documentStatus: 0 | 1;
} {
  const documentType = TYPE_ENTREE_VERS_SOURCE[type];
  const documentStatus = STATUT_ENTREE_VERS_NUMERIQUE[statut];
  if (documentType === undefined || documentStatus === undefined) {
    throw erreurCapaciteNonSupporteeService(
      "detail_document",
      "reference.type/reference.statut",
      "Combinaison type/statut non routable en v0.1.",
      { type, statut },
    );
  }
  return { documentType, documentStatus };
}

/**
 * Résout `documentType`/`documentStatus` source à partir d'un élément déjà mappé (résultat de
 * `listerDocumentsVente`/résolution par numéro, D-T11-3) : `type` du domaine porte déjà le nom
 * source brut (`DocumentVenteSchema.type`, ex. `"SaleInvoice"`), `statut` reste `provisoire|valide|
 * inconnu`. Type `inconnu` ou statut `inconnu` ⇒ non routable, `undefined` (jamais une valeur
 * inventée) ; l'appelant traduit cela en `UNSUPPORTED_CAPABILITY` avant tout appel réseau.
 */
export function resoudreTypeStatutSourceDepuisElement(document: DocumentVente): {
  documentType: TypeDocumentSource;
  documentStatus: 0 | 1;
} | null {
  if (document.type === "inconnu" || document.statut === "inconnu") {
    return null;
  }
  return { documentType: document.type, documentStatus: document.statut === "valide" ? 1 : 0 };
}
