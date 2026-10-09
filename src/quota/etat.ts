import type { GroupeQuota } from "../config/resolution.js";
import type { DateCivile } from "../domain/date.js";
import { dateCivileDansFuseau } from "../domain/date.js";

/** Type de l'enveloppe `StoreJson` pour l'état de quota (07 §4) : jamais lu/écrit sous un autre nom. */
export const TYPE_QUOTA = "quota";

/**
 * État persistant d'un groupe de quota (07 §4). Pas de liste d'instants pré-réservés : seul le
 * dernier départ réellement admis est conservé. `consomme` et `consommeAuth` sont deux compteurs
 * distincts — les appels auth ne décrémentent jamais `consomme` (07 §4, 3ᵉ paragraphe).
 */
export interface EtatQuotaPersistant {
  readonly jour: DateCivile;
  readonly consomme: number;
  readonly consommeAuth: number;
  readonly dernierDepart: string | null;
  readonly finCooldown429: string | null;
}

function etatVierge(jour: DateCivile): EtatQuotaPersistant {
  return { jour, consomme: 0, consommeAuth: 0, dernierDepart: null, finCooldown429: null };
}

/**
 * Applique le rollover de jour civil (07 §4) : reset **seulement** quand le jour civil courant
 * (dans `resetTimezone` du groupe) est strictement postérieur au jour stocké — comparaison
 * lexicographique `YYYY-MM-DD`, suffisante et insensible au fuseau une fois la date civile
 * calculée. Une horloge reculée (jour courant antérieur ou égal) ne réinitialise jamais par
 * anticipation : compteurs, `dernierDepart` et `finCooldown429` sont conservés tels quels.
 *
 * Seuls `consomme`/`consommeAuth`/`jour` sont réinitialisés au rollover : `dernierDepart` et
 * `finCooldown429` portent sur l'horloge murale, indépendante du jour civil, et survivent donc au
 * passage de minuit.
 */
export function appliquerRollover(
  actuelle: EtatQuotaPersistant | null,
  maintenant: Date,
  config: GroupeQuota,
): EtatQuotaPersistant {
  const jourCourant = dateCivileDansFuseau(maintenant, config.resetTimezone);
  if (actuelle === null) {
    return etatVierge(jourCourant);
  }
  if (actuelle.jour < jourCourant) {
    return {
      jour: jourCourant,
      consomme: 0,
      consommeAuth: 0,
      dernierDepart: actuelle.dernierDepart,
      finCooldown429: actuelle.finCooldown429,
    };
  }
  return actuelle;
}
