/** État de quota d'un groupe, pour `meta.quota_*` (07 §4/§5). */
export interface StatutQuota {
  quotaJourRestant: number;
  quotaUtilisable: number;
  quotaEstime: boolean;
}

/**
 * Admission métier partagée par groupe de quota (07 §4). L'implémentation inter-processus
 * (compteur, réserve, `minIntervalMs`) arrive en T05 ; ce port ne fixe que la forme de l'appel.
 */
export interface QuotaStore {
  /** Réserve un départ pour `groupe` ; se résout quand l'appel peut partir, rejette si le budget/deadline l'interdit. */
  reserveDepart(groupe: string, deadline: Date, signal?: AbortSignal): Promise<void>;
  getStatut(groupe: string): Promise<StatutQuota>;
}
