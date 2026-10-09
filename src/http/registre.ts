import type { Famille } from "../domain/capabilities.js";

/** Table statique des routes autorisées (décision 3/4, 07 §4) : aucun `POST` métier. */
export interface EntreeRegistre {
  readonly id: string;
  readonly famille: Famille;
  readonly methode: "GET";
  readonly prefixe: string;
  /** Gabarit de chemin, segments notés `{nom}` (décision 1, un segment par entrée de `segments`). */
  readonly chemin: string;
  readonly segments: readonly string[];
  readonly parametres: readonly string[];
  readonly hote: "metier";
}

const PREFIXE_CPT = "/hubbix-cpttpe/api/v1";
const PREFIXE_GC = "/hubbix-gctpe/api/public/v1";

function routeCpt(
  id: string,
  chemin: string,
  segments: readonly string[],
  parametres: readonly string[],
): EntreeRegistre {
  return { id, famille: "hubbix-compta", methode: "GET", prefixe: PREFIXE_CPT, chemin, segments, parametres, hote: "metier" };
}

function routeGc(
  id: string,
  chemin: string,
  segments: readonly string[],
  parametres: readonly string[],
): EntreeRegistre {
  return { id, famille: "hubbix-gescom", methode: "GET", prefixe: PREFIXE_GC, chemin, segments, parametres, hote: "metier" };
}

/**
 * Liste blanche de couples méthode/route, exactement les routes nécessaires aux outils et
 * ressources de 07 §6 (décision 4), transcrites de 02 §2/§3. Chaque paramètre retenu est justifié
 * par une ligne de 02 ; les paramètres marqués 🟡 y sont explicitement exclus (décision 5) :
 * `category` (auxiliary-accounts), `journals` CSV et `nature` (lines-entries), `status` et
 * `bankAccount(s)` (bank-transactions), `filter.query` (GC), `filter`/`order` (journals).
 * Volontairement absents : dashboards, pièces jointes (binaire), export/import/maintenance, SaaS.
 */
export const REGISTRE_ROUTES: readonly EntreeRegistre[] = [
  // Hubbix Comptabilité TPE — 02 §2
  routeCpt("cpt-domain-information", "/domain-information", [], []),
  routeCpt("cpt-folder-settings", "/folder-settings", [], []),
  routeCpt("cpt-auxiliary-account-types", "/auxiliary-account-types", [], []),
  // 02 §2 /auxiliary-accounts : search, isActive, numberFrom, sortField, sortDirection, skip, take.
  routeCpt(
    "cpt-auxiliary-accounts",
    "/auxiliary-accounts",
    [],
    ["search", "isActive", "numberFrom", "sortField", "sortDirection", "skip", "take"],
  ),
  routeCpt("cpt-auxiliary-account-detail", "/auxiliary-accounts/{numero}", ["numero"], []),
  // 02 §2 /general-account : search, isActive, isRacine, isCollective, numberFrom, classNumber, vatRate, territoriality.
  routeCpt(
    "cpt-general-account",
    "/general-account",
    [],
    ["search", "isActive", "isRacine", "isCollective", "numberFrom", "classNumber", "vatRate", "territoriality"],
  ),
  routeCpt("cpt-general-account-detail", "/general-account/{numero}", ["numero"], []),
  // 02 §2 /journals : `filter`/`order` exclus (décision 5) ; pas de pagination documentée.
  routeCpt("cpt-journals", "/journals", [], []),
  routeCpt("cpt-journal-detail", "/journals/{code}", ["code"], []),
  // 02 §2 /lines-entries : `journals` (CSV) et `nature` exclus (🟡, décision 5).
  routeCpt(
    "cpt-lines-entries",
    "/lines-entries",
    [],
    ["startDate", "endDate", "generalAccount", "auxiliaryAccount", "valid", "lettered", "assigned", "bankDeposit", "amount", "search", "skip", "take"],
  ),
  routeCpt("cpt-entry-detail", "/entries/{uuid}", ["uuid"], []),
  routeCpt("cpt-search-entries", "/search-entries/entries", [], ["uuids"]),
  // 02 §2 /bank-transactions : `status` et `bankAccount(s)` exclus (🟡, décision 5).
  routeCpt(
    "cpt-bank-transactions",
    "/bank-transactions",
    [],
    ["startDate", "endDate", "sort", "withAssignmentSuggestion", "skip", "take"],
  ),
  routeCpt("cpt-vat-rate", "/vat-rate", [], []),

  // Hubbix Gestion Commerciale TPE — 02 §3
  routeGc("gc-customer-detail", "/customers/{id}", ["id"], []),
  // 02 §3 convention de liste : take, skip, sortingOrder.property, sortingOrder.sortType ; `filter.query` exclu.
  routeGc("gc-items", "/items", [], ["take", "skip", "sortingOrder.property", "sortingOrder.sortType"]),
  routeGc("gc-item-good-detail", "/items/goods/{id}", ["id"], []),
  routeGc("gc-item-service-detail", "/items/services/{id}", ["id"], []),
  // 02 §3 /sale-documents : aucun filtre date/type/client documenté, seulement `filter.query` (exclu).
  routeGc("gc-sale-documents", "/sale-documents", [], ["take", "skip", "sortingOrder.property", "sortingOrder.sortType"]),
  routeGc("gc-sale-invoice-detail", "/sale-invoices/{id}", ["id"], []),
  routeGc("gc-sale-invoice-validated-detail", "/sale-invoices/validated/{id}", ["id"], []),
  routeGc("gc-sale-credit-detail", "/sale-credits/{id}", ["id"], []),
  routeGc("gc-sale-credit-validated-detail", "/sale-credits/validated/{id}", ["id"], []),
  routeGc("gc-sale-quote-detail", "/sale-quotes/{id}", ["id"], []),
  routeGc("gc-sale-quote-invoiced-detail", "/sale-quotes/invoiced/{id}", ["id"], []),
  routeGc("gc-sale-deposit-invoice-detail", "/sale-deposit-invoices/{id}", ["id"], []),
  routeGc("gc-sale-deposit-credit-detail", "/sale-deposit-credits/{id}", ["id"], []),
  routeGc("gc-sale-commitments", "/sale-commitments", [], ["take", "skip", "sortingOrder.property", "sortingOrder.sortType"]),
  routeGc("gc-settlements", "/settlements", [], ["take", "skip", "sortingOrder.property", "sortingOrder.sortType"]),
  routeGc("gc-vat-rates", "/vat-rates", [], []),
];

export function trouverRoute(id: string): EntreeRegistre | undefined {
  return REGISTRE_ROUTES.find((route) => route.id === id);
}

/** Extrait les noms de segments `{nom}` du gabarit de chemin, dans l'ordre d'apparition. */
export function segmentsDuGabarit(chemin: string): string[] {
  const noms: string[] = [];
  const motif = /\{([^}]+)\}/g;
  let correspondance: RegExpExecArray | null;
  while ((correspondance = motif.exec(chemin)) !== null) {
    noms.push(correspondance[1] as string);
  }
  return noms;
}
