import type { Budget } from "../http/budget.js";

/** Position distante opaque au moteur (offset, skip/top, lien fournisseur…) (07 §5). */
export type PositionSource = Readonly<Record<string, string | number>> | null;

/**
 * Page brute renvoyée par une source (07 §5). Le moteur ne construit aucune URL et n'interprète
 * pas `suivant` : il la transmet telle quelle au prochain appel de `lirePage`.
 */
export interface PageSource<E> {
  readonly elements: readonly E[];
  /** Position de la page suivante, `null` quand le contrat de la route déclare la fin. */
  readonly suivant: PositionSource;
  /** Total **non filtré** annoncé par EBP, `null` si absent ou non prouvé. */
  readonly totalSource: number | null;
  /** Déclaration d'incomplétude intrinsèque de la source (limitation connue de la route). */
  readonly sourceIncomplete?: boolean;
}

/**
 * Port de page source abstraite (07 §1/§5) : un adapter ne fait ni refresh, ni retry, ni boucle
 * de pagination, ni calcul métier. Le moteur de `scan.ts` ne connaît une source EBP que par cette
 * interface ; `Budget` et `ExecutionContext` restent ceux existants de `src/http/budget.ts` et
 * `src/ports/execution-context.ts`.
 */
export interface SourcePaginee<E> {
  /** Libellé stable pour `meta.sources` et la clé de cache, ex. `"hubbix-gescom:/sale-documents"`. */
  readonly id: string;
  /** Classe de fraîcheur pour le TTL de cache (07 §5) : `referentiel` 1 h, `transactionnel` 60 s. */
  readonly nature: "referentiel" | "transactionnel";
  /** Taille de page demandée à EBP : entier 1..100 (page EBP ≤ 100, 07 §5). */
  readonly taillePage: number;
  lirePage(position: PositionSource, budget: Budget): Promise<PageSource<E>>;
  /** Identité stable d'un élément : IDs déjà vus, détection de page répétée. */
  idElement(element: E): string;
}
