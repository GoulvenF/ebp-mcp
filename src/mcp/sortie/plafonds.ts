import type { Enveloppe } from "../../domain/envelope.js";
import { erreurReponseTropVolumineuseSortie } from "./erreurs.js";

/** Plafond de taille de sortie (D-T12-9, 07 §7), mesuré en octets UTF-8 de `JSON.stringify`. */
export const PLAFOND_SORTIE_OCTETS = 1_048_576;

/** Taille JSON UTF-8 d'une valeur quelconque (D-T12-9) ; `undefined` traité comme `null`. */
export function tailleJsonUtf8(valeur: unknown): number {
  return Buffer.byteLength(JSON.stringify(valeur) ?? "null", "utf8");
}

/**
 * Fiche, agrégat, contexte ou ressource (`pagination: null`, D-T12-9) : `RESPONSE_TOO_LARGE` si
 * les résultats seuls dépassent le plafond après politique de sortie — jamais de troncature
 * invisible de ses lignes. Le brut n'entre jamais dans cette mesure (D-T12-7).
 */
export function verifierPlafondFiche<T>(enveloppe: Enveloppe<T>): void {
  if (enveloppe.pagination !== null) {
    return;
  }
  if (tailleJsonUtf8(enveloppe.resultats) > PLAFOND_SORTIE_OCTETS) {
    throw erreurReponseTropVolumineuseSortie();
  }
}

/**
 * Garde finale du sérialiseur (D-T12-9) : une enveloppe qui dépasse encore le plafond, brut
 * compris, une fois tout le reste appliqué (politique de sortie, plafond de liste, plafond de
 * fiche) donne `RESPONSE_TOO_LARGE` plutôt qu'une sortie silencieusement tronquée.
 */
export function verifierPlafondFinal<T>(enveloppe: Enveloppe<T>): void {
  if (tailleJsonUtf8(enveloppe) > PLAFOND_SORTIE_OCTETS) {
    throw erreurReponseTropVolumineuseSortie();
  }
}
