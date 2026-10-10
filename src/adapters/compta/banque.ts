import type { z } from "zod";
import type { Budget } from "../../http/budget.js";
import type { ContexteHttp, DependancesClientHttp } from "../../http/client.js";
import { executerRequetePourRoute } from "../../http/client.js";
import { TransactionBancaireSchema } from "../../domain/schemas/compta.js";
import { verifierCapaciteSupportee } from "./capacites.js";
import { montantDepuisSource } from "./lignes.js";
import { lireEnveloppeData } from "./enveloppe.js";
import { erreurEnveloppeInattendueCompta, erreurSkipInvalideCompta, erreurTakeInvalideCompta } from "./errors.js";
import { BankTransactionEbpSchema } from "./schemas-ebp.js";

export type TransactionBancaire = z.infer<typeof TransactionBancaireSchema>;

function validerSkipTake(skip: number, take: number): void {
  if (!Number.isInteger(take) || take < 1 || take > 100) {
    throw erreurTakeInvalideCompta(take);
  }
  if (!Number.isInteger(skip) || skip < 0) {
    throw erreurSkipInvalideCompta(skip);
  }
}

export interface RequeteListeTransactionsBancaires {
  readonly skip: number;
  readonly take: number;
  readonly startDate?: string;
  readonly endDate?: string;
  /** Capacité non supportée (D-T09-5) : demandée uniquement pour déclencher le refus avant réseau. */
  readonly statut?: string;
}

export interface PageTransactionsBancaires {
  readonly resultats: TransactionBancaire[];
  readonly total_source: number | null;
  readonly renvoyes: number;
  readonly avertissements: string[];
}

/**
 * `/bank-transactions` (02 §2) : seuls `startDate`, `endDate`, `skip`, `take` sont envoyés
 * (D-T09-4). `status`/`bankAccount(s)` sont exclus (capacité non supportée, D-T09-5) ; `sort` et
 * `withAssignmentSuggestion`, bien qu'acceptés par le registre T07, ne sont jamais envoyés ici —
 * aucun tri explicite demandé (D-T09-4). `status` source (0/1/2) reste `statut: "inconnu"` avec
 * `statut_source` conservé tel quel (D-T09-6) ; `debit`/`credit` `null` côté inutilisé jamais
 * convertis en `0` (D-T09-3).
 */
export async function listerTransactionsBancaires(
  deps: DependancesClientHttp,
  budget: Budget,
  contexte: ContexteHttp,
  requete: RequeteListeTransactionsBancaires,
): Promise<PageTransactionsBancaires> {
  verifierCapaciteSupportee("filtre_statut_bancaire", requete.statut !== undefined);
  validerSkipTake(requete.skip, requete.take);
  const parametres: Record<string, string | number> = { skip: requete.skip, take: requete.take };
  if (requete.startDate !== undefined) parametres.startDate = requete.startDate;
  if (requete.endDate !== undefined) parametres.endDate = requete.endDate;
  const corps = await executerRequetePourRoute(deps, budget, contexte, "cpt-bank-transactions", { parametres });
  const enveloppe = lireEnveloppeData("cpt-bank-transactions", corps);
  const avertissements: string[] = [];
  const resultats = enveloppe.elements.map((brut): TransactionBancaire => {
    const resultat = BankTransactionEbpSchema.safeParse(brut);
    if (!resultat.success) {
      throw erreurEnveloppeInattendueCompta("cpt-bank-transactions");
    }
    const source = resultat.data;
    const debit = montantDepuisSource(source.debit, "bank-transactions.debit", avertissements);
    const credit = montantDepuisSource(source.credit, "bank-transactions.credit", avertissements);
    const statutSource =
      source.status === null || source.status === undefined ? null : String(source.status);
    return {
      id: null,
      libelle: source.label,
      compte_bancaire: source.account?.iban ?? null,
      date_operation: source.operationDate,
      date_valeur: source.valueDate,
      debit,
      credit,
      reference: source.reference,
      statut: statutSource === null ? null : "inconnu",
      statut_source: statutSource,
    };
  });
  return { resultats, total_source: enveloppe.totalSource, renvoyes: resultats.length, avertissements };
}
