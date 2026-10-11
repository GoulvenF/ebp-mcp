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
 * Garde finale du sérialiseur (D-T12-9, précision Lead Tech) : une enveloppe qui dépasse encore le
 * plafond, brut compris, une fois tout le reste appliqué (politique de sortie, plafond de liste,
 * plafond de fiche). Si `resultats` et `bruts` restent chacun sous le plafond mais le dépassent
 * ensemble, le brut est omis (`bruts: null` + avertissement, 07 §7) plutôt que de faire échouer
 * l'appel ; `RESPONSE_TOO_LARGE` n'est levé que si le dépassement persiste sans le brut, ou s'il
 * n'y avait pas de brut à omettre.
 */
export function verifierPlafondFinal<T>(enveloppe: Enveloppe<T>): Enveloppe<T> {
  if (tailleJsonUtf8(enveloppe) <= PLAFOND_SORTIE_OCTETS) {
    return enveloppe;
  }
  if (Array.isArray(enveloppe.bruts)) {
    const sansBrut: Enveloppe<T> = {
      ...enveloppe,
      bruts: null,
      meta: { ...enveloppe.meta, avertissements: [...enveloppe.meta.avertissements, "brut omis : plafond 1 Mio"] },
    };
    if (tailleJsonUtf8(sansBrut) <= PLAFOND_SORTIE_OCTETS) {
      return sansBrut;
    }
  }
  throw erreurReponseTropVolumineuseSortie();
}
