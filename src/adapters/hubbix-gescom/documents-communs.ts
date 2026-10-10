import type { DocumentVenteSchema } from "../../domain/schemas/gescom.js";
import { interpreterEnumChaine, interpreterEnumNumerique } from "./enum-source.js";
import { TYPES_DOCUMENT_CONNUS, type TypeDocumentSource } from "./routage.js";
import type { z } from "zod";

export type DocumentVente = z.infer<typeof DocumentVenteSchema>;

/** Mappage partagé entre la liste `/sale-documents` et les 8 routes de détail (02 §3). */

const STATUTS_DOCUMENT: ReadonlyMap<number, DocumentVente["statut"]> = new Map([
  [0, "provisoire"],
  [1, "valide"],
]);

/** `AccountingTransferStatus` (02 §3) : `SentForAccounting=0`, `Accounted=1`, `EntryGenerationFailure=2`. */
const STATUTS_COMPTABLES: ReadonlyMap<number, NonNullable<DocumentVente["statut_comptable"]>> = new Map([
  [0, "sent_for_accounting"],
  [1, "accounted"],
  [2, "entry_generation_failure"],
]);

/**
 * `documentType` (02 §3, chaîne) ⇒ `type` du domaine. Via `interpreterEnumChaine` : distingue un
 * champ absent d'une valeur hors énumération et cite la valeur source sans la requalifier (même
 * traitement que `mapperStatut`, remarque de revue T10b).
 */
export function mapperType(documentType: unknown): { type: DocumentVente["type"]; avertissement: string | null } {
  const resultat = interpreterEnumChaine(documentType, TYPES_DOCUMENT_CONNUS as readonly TypeDocumentSource[], "documentType");
  return { type: resultat.valeur, avertissement: resultat.avertissement };
}

/**
 * `documentStatus` (02 §3, numérique) ⇒ `statut` du domaine. Via `interpreterEnumNumerique` :
 * distingue un champ absent d'une valeur hors énumération, cite la valeur source sans la
 * requalifier (jamais convertie en chaîne avant comparaison).
 */
export function mapperStatut(documentStatus: unknown): { statut: DocumentVente["statut"]; avertissement: string | null } {
  const resultat = interpreterEnumNumerique(documentStatus, STATUTS_DOCUMENT, "documentStatus");
  return { statut: resultat.valeur, avertissement: resultat.avertissement };
}

export function mapperStatutComptable(accountingTransferStatus: unknown): {
  statut_comptable: DocumentVente["statut_comptable"];
  avertissement: string | null;
} {
  const resultat = interpreterEnumNumerique(accountingTransferStatus, STATUTS_COMPTABLES, "accountingTransferStatus");
  return { statut_comptable: resultat.valeur, avertissement: resultat.avertissement };
}
