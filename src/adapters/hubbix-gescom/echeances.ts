import type { z } from "zod";
import type { Budget } from "../../http/budget.js";
import type { ContexteHttp, DependancesClientHttp } from "../../http/client.js";
import { executerRequetePourRoute } from "../../http/client.js";
import { decimalDepuisLexeme } from "../../domain/decimal.js";
import { EcheanceSchema } from "../../domain/schemas/gescom.js";
import { lireEnveloppeListe } from "./enveloppe.js";
import { erreurEnveloppeInattendue, erreurPaginationInvalide, erreurSkipInvalide, erreurTakeInvalide } from "./errors.js";
import { EcheanceEbpSchema } from "./schemas-ebp.js";

export type Echeance = z.infer<typeof EcheanceSchema>;

function opaque(valeur: unknown): string | null {
  if (typeof valeur === "string") return valeur;
  if (typeof valeur === "number") return String(valeur);
  return null;
}

/**
 * Mappe un élément de `/sale-commitments` (02 §3). `remainingAmount` de l'**échéance** est
 * mappé sur `reste_du` — distinct du `dueAmount` du **document** (`documents.ts`), jamais
 * additionné. `document.documentType`/`document.documentStatus` restent opaques (chaînes brutes,
 * `EcheanceSchema`) : aucune interprétation d'énumération ici, cette échéance n'est pas une
 * référence de routage (07 §5/§6).
 */
function mapperEcheance(brut: unknown): Echeance {
  const resultat = EcheanceEbpSchema.safeParse(brut);
  if (!resultat.success) {
    throw erreurEnveloppeInattendue("gc-sale-commitments");
  }
  const source = resultat.data;
  return {
    id: source.id,
    date: source.date,
    tiers_id: source.customer?.id ?? null,
    tiers_nom: source.customer?.name ?? null,
    tiers_code: source.customer?.code ?? null,
    document_id: source.document?.id ?? null,
    document_numero: source.document?.number ?? null,
    document_type: opaque(source.document?.documentType),
    document_statut: opaque(source.document?.documentStatus),
    mode_paiement: source.paymentMode,
    montant: decimalDepuisLexeme(source.amount),
    devise: null,
    reste_du: decimalDepuisLexeme(source.remainingAmount),
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

export interface RequeteListeEcheances {
  readonly skip: number;
  readonly take: number;
}

export interface PageEcheances {
  readonly resultats: Echeance[];
  readonly total_source: number | null;
  readonly renvoyes: number;
  readonly skip_demande: number;
  readonly skip_renvoye: number;
  readonly avertissements: string[];
}

/** Lit une page de `/sale-commitments` (échéancier, 02 §3). Aucun calcul de retard ici (T11). */
export async function listerEcheances(
  deps: DependancesClientHttp,
  budget: Budget,
  contexte: ContexteHttp,
  requete: RequeteListeEcheances,
): Promise<PageEcheances> {
  validerSkipTake(requete.skip, requete.take);
  const corps = await executerRequetePourRoute(deps, budget, contexte, "gc-sale-commitments", {
    parametres: { skip: requete.skip, take: requete.take },
  });
  const enveloppe = lireEnveloppeListe("gc-sale-commitments", corps, requete.skip);
  if (enveloppe.skipRenvoye !== requete.skip) {
    throw erreurPaginationInvalide("gc-sale-commitments", requete.skip, enveloppe.skipRenvoye);
  }
  const resultats = enveloppe.elements.map(mapperEcheance);
  return {
    resultats,
    total_source: enveloppe.totalSource,
    renvoyes: resultats.length,
    skip_demande: requete.skip,
    skip_renvoye: enveloppe.skipRenvoye,
    avertissements: [],
  };
}
