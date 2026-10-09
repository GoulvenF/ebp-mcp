/** État de quota d'un groupe, pour `meta.quota_*` (07 §4/§5). */
export interface StatutQuota {
  quotaJourRestant: number;
  quotaUtilisable: number;
  quotaEstime: boolean;
}

/**
 * Admission métier partagée par groupe de quota (07 §4), implémentée en T05
 * (`src/quota/`) : compteur persistant, espacement réel des départs, réserve, cooldown 429
 * partagé, rollover de jour dans le fuseau du groupe. Deux profils ou processus qui déclarent le
 * même nom de groupe partagent le même état, qu'ils tournent dans le même processus ou non.
 */
export interface QuotaStore {
  /**
   * Réserve un départ pour `groupe` (07 §4) : se résout quand l'appel peut partir (réservation
   * déjà persistée), rejette sans attente mesurable ni réservation si la réserve du groupe est
   * atteinte ou si l'attente nécessaire dépasserait `deadline` (budget/deadline insuffisant,
   * A12 ; inclut le cas `Retry-After` supérieur à `deadline`). N'attend et ne retient jamais le
   * verrou pendant l'attente elle-même.
   */
  reserveDepart(groupe: string, deadline: Date, signal?: AbortSignal): Promise<void>;
  /**
   * Lecture seule (07 §4/§5) : n'écrit jamais d'état ni n'acquiert de verrou d'écriture. Applique
   * le rollover de jour en mémoire pour ne jamais annoncer le quota d'une journée civile passée.
   */
  getStatut(groupe: string): Promise<StatutQuota>;
  /**
   * Enregistre un refus 429 pour `groupe` en prenant un instant de fin déjà calculé (07 §4) : le
   * parsing de `Retry-After` (secondes ou date HTTP) reste à T07. Sous verrou, le cooldown ne
   * peut que s'allonger (`max` avec l'existant) — jamais être raccourci ni effacé par un autre
   * processus partageant le même groupe.
   */
  enregistrerCooldown429(groupe: string, finCooldown: Date, signal?: AbortSignal): Promise<void>;
  /**
   * Incrémente le compteur auth séparé de `groupe` (07 §4) : sous le même verrou que
   * `reserveDepart`, mais sans espacement ni réserve — il ne refuse jamais et n'apparaît jamais
   * dans `StatutQuota`, tant que l'inclusion des appels auth dans le quota EBP n'est pas établie.
   */
  incrementerAuth(groupe: string, signal?: AbortSignal): Promise<void>;
  /**
   * Lecture dédiée du compteur auth séparé de `groupe` (07 §4), pour le diagnostic (T13) ; ne
   * modifie jamais l'état et n'alimente jamais `StatutQuota`.
   */
  getCompteurAuth(groupe: string): Promise<number>;
}
