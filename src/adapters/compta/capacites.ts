import type { Capacite } from "../../domain/capabilities.js";
import { erreurCapaciteNonSupporteeCompta } from "./errors.js";

/**
 * Capacités déclarées non supportées par l'adapter Comptabilité en v0.1 (D-T09-5). Chaque entrée
 * cite la raison et la preuve/l'audit correspondant ; une capacité demandée malgré ce statut est
 * refusée **avant** tout appel réseau (`UNSUPPORTED_CAPABILITY`), jamais tentée en filtre local
 * silencieux ni envoyée comme paramètre conjectural à EBP.
 */
export function capacitesCompta(): Capacite[] {
  return [
    {
      nom: "filtre_statut_bancaire",
      statut: "non_supportee",
      motif: "`status` de /bank-transactions (0/1/2) non prouvé (E07) ; aucun mapping deviné.",
    },
    {
      nom: "filtre_categorie_tiers",
      statut: "non_supportee",
      motif: "`category` de /auxiliary-accounts non documenté par 02 (E07) ; paramètre conjectural exclu.",
    },
    {
      nom: "filtre_nature_ligne",
      statut: "non_supportee",
      motif: "`nature` de /lines-entries non documenté par 02 (E07) ; paramètre conjectural exclu.",
    },
    {
      nom: "tri_explicite",
      statut: "non_supportee",
      motif: "Tri Hubbix (sortField/sortDirection, filter/order) non prouvé (E06) ; ordre de la source déclaré uniquement.",
    },
    {
      nom: "echeancier_cpt",
      statut: "non_supportee",
      motif: "Ligne 411 non lettrée ≠ facture impayée (A03) : paiements, avoirs et lettrages partiels non résolus en v0.1.",
    },
    {
      nom: "ca_cpt",
      statut: "non_supportee",
      motif: "Agrégat de chiffre d'affaires CPT hors périmètre v0.1 (A03, 07 §8) ; calcul métier différé à T11+.",
    },
  ];
}

const NOMS_CAPACITE = new Set(capacitesCompta().map((capacite) => capacite.nom));

/**
 * Refuse avant tout réseau une capacité non supportée explicitement demandée (D-T09-5). Ne fait
 * rien si `demandee` est `false`/absente : une entrée optionnelle absente n'implique pas un filtre
 * caché (07 §6).
 */
export function verifierCapaciteSupportee(nom: string, demandee: boolean): void {
  if (!demandee) {
    return;
  }
  if (NOMS_CAPACITE.has(nom)) {
    throw erreurCapaciteNonSupporteeCompta(nom);
  }
}
