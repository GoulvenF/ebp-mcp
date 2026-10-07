import type { ExecutionContext } from "./execution-context.js";

/** Requête de lecture d'une page source, sans boucle de pagination ni calcul métier (07 §1). */
export interface RequetePage {
  route: string;
  curseur?: string;
  limite: number;
  filtres?: Record<string, unknown>;
}

export interface PageLue<T> {
  elements: T[];
  curseurSuivant: string | null;
  hasMore: boolean;
}

/** Un adapter ne fait ni refresh, ni retry, ni boucle de pagination, ni calcul métier (07 §1). */
export interface Adapter<T = unknown> {
  readPage(requete: RequetePage, contexte: ExecutionContext): Promise<PageLue<T>>;
}
