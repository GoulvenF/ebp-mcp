/** Complétude d'un résultat (07 §5). */
export type Completude = "complete" | "page" | "partielle";

/** Raison d'arrêt d'un parcours (07 §5). `null` = parcours non interrompu. */
export type RaisonArret =
  | null
  | "limite"
  | "budget"
  | "quota"
  | "deadline"
  | "source_incomplete"
  | "cursor_capacity";

/** Mode d'exécution, toujours explicite, jamais implicite (07 §5). */
export type Mode = "mock" | "live";

/** `null` pour une fiche, un contexte ou un agrégat (07 §5). */
export interface Pagination {
  renvoyes: number;
  total: number | null;
  total_source: number | null;
  hasMore: boolean;
  curseur: string | null;
}

/**
 * `quota_jour_restant`/`quota_utilisable`/`quota_estime` sont `null` ensemble quand aucun groupe
 * de quota n'est ciblé par l'appel (07 §5).
 */
export interface Meta {
  appels_api: number;
  appels_auth: number;
  duree_ms: number;
  quota_jour_restant: number | null;
  quota_utilisable: number | null;
  quota_estime: boolean | null;
  approximatif: boolean;
  completude: Completude;
  raison_arret: RaisonArret;
  sources: string[];
  avertissements: string[];
  mode: Mode;
  observe_a: string;
}

/** Enveloppe métier commune à tous les outils (07 §5). `dossier: null` pour les outils de contexte globaux. */
export interface Enveloppe<T> {
  dossier: string | null;
  resultats: T[];
  pagination: Pagination | null;
  meta: Meta;
}
