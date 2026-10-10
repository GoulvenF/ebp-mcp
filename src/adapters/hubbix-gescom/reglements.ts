import type { z } from "zod";
import type { Budget } from "../../http/budget.js";
import type { ContexteHttp, DependancesClientHttp } from "../../http/client.js";
import { executerRequetePourRoute } from "../../http/client.js";
import { decimalDepuisLexeme } from "../../domain/decimal.js";
import { ReglementSchema } from "../../domain/schemas/gescom.js";
import { lireEnveloppeListe } from "./enveloppe.js";
import {
  erreurCapaciteNonSupportee,
  erreurEnveloppeInattendue,
  erreurPaginationInvalide,
  erreurSkipInvalide,
  erreurTakeInvalide,
} from "./errors.js";
import { interpreterEnumNumerique } from "./enum-source.js";
import { ReglementEbpSchema } from "./schemas-ebp.js";

export type Reglement = z.infer<typeof ReglementSchema>;

/** `SettlementType` (02 §3) : `CashReceipt = 1`, `Reimbursement = 2`. */
const TYPES_REGLEMENT: ReadonlyMap<number, NonNullable<Reglement["type"]>> = new Map([
  [1, "encaissement"],
  [2, "remboursement"],
]);

function mapperType(settlementType: unknown): { type: Reglement["type"]; avertissement: string | null } {
  const resultat = interpreterEnumNumerique(settlementType, TYPES_REGLEMENT, "settlementType");
  return { type: resultat.valeur, avertissement: resultat.avertissement };
}

/**
 * Mappe un élément de `/settlements` (02 §3, A14). `tiers_id` reste toujours `null` : la source
 * ne fournit aucun ID client sur cette route, seulement `customerName` — aucun rapprochement par
 * nom (07 §1).
 */
function mapperReglement(brut: unknown, avertissements: string[]): Reglement {
  const resultat = ReglementEbpSchema.safeParse(brut);
  if (!resultat.success) {
    throw erreurEnveloppeInattendue("gc-settlements");
  }
  const source = resultat.data;
  const { type, avertissement } = mapperType(source.settlementType);
  if (avertissement !== null) avertissements.push(avertissement);
  return {
    code: source.code,
    date: source.date,
    tiers_nom: source.customerName,
    tiers_id: null,
    montant: decimalDepuisLexeme(source.amount),
    devise: null,
    montant_restant_a_affecter: decimalDepuisLexeme(source.stillToBeDistributedAmount),
    mode_paiement_libelle: source.paymentModeLabel,
    reference: source.paymentReference,
    type,
  };
}

function validerSkipTake(skip: number, take: number): void {
  if (!Number.isInteger(take) || take < 1 || take > 100) {
    throw erreurTakeInvalide(take);
  }
  if (!Number.isInteger(skip) || skip < 0) {
    throw erreurSkipInvalide(skip);
  }
}

export interface RequeteListeReglements {
  readonly skip: number;
  readonly take: number;
  /** Refusé avant réseau (A14) : la source ne fournit pas d'ID client sur `/settlements`. */
  readonly tiers?: string;
}

export interface PageReglements {
  readonly resultats: Reglement[];
  readonly total_source: number | null;
  readonly renvoyes: number;
  readonly skip_demande: number;
  readonly skip_renvoye: number;
  readonly avertissements: string[];
}

/**
 * Lit une page de `/settlements` (règlements, 02 §3). Un filtre par ID tiers est refusé avant
 * tout accès réseau (`UNSUPPORTED_CAPABILITY`) : la source ne fournit pas d'ID client sur cette
 * route (A14), aucun filtrage local n'est tenté à sa place (T08/T11).
 */
export async function listerReglements(
  deps: DependancesClientHttp,
  budget: Budget,
  contexte: ContexteHttp,
  requete: RequeteListeReglements,
): Promise<PageReglements> {
  if (requete.tiers !== undefined) {
    throw erreurCapaciteNonSupportee(
      "lister_reglements_filtre_tiers",
      "Filtre par identifiant tiers non supporté en v0.1 sur /settlements.",
      "Retirer le filtre tiers ; la source ne fournit pas d'ID client sur cette route (A14), aucun filtrage local n'est tenté à sa place.",
    );
  }
  validerSkipTake(requete.skip, requete.take);
  const corps = await executerRequetePourRoute(deps, budget, contexte, "gc-settlements", {
    parametres: { skip: requete.skip, take: requete.take },
  });
  const enveloppe = lireEnveloppeListe("gc-settlements", corps, requete.skip);
  if (enveloppe.skipRenvoye !== requete.skip) {
    throw erreurPaginationInvalide("gc-settlements", requete.skip, enveloppe.skipRenvoye);
  }
  const avertissements: string[] = [];
  const resultats = enveloppe.elements.map((brut) => mapperReglement(brut, avertissements));
  return {
    resultats,
    total_source: enveloppe.totalSource,
    renvoyes: resultats.length,
    skip_demande: requete.skip,
    skip_renvoye: enveloppe.skipRenvoye,
    avertissements,
  };
}
