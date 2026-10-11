import type { Budget } from "../../http/budget.js";
import type { SourcePaginee } from "../../pagination/source-page.js";

export interface PageListeUnique<T> {
  readonly resultats: readonly T[];
  readonly avertissements: readonly string[];
}

export interface OptionsSourceListeUnique<T> {
  readonly id: string;
  readonly idDe: (item: T) => string;
  readonly lire: (budget: Budget) => Promise<PageListeUnique<T>>;
  /** Accumulateur partagé avec l'appelant (même convention que `construireSourceSkipTake`) : rempli
   * uniquement lors d'une lecture réelle, jamais sur un coup de cache. */
  readonly avertissements: string[];
}

/**
 * `SourcePaginee` pour un référentiel lu par l'adapter en un seul appel (D-T12-13 : journaux, plan
 * comptable, taux de TVA) : l'unique page contient tous les éléments renvoyés, `suivant: null`
 * toujours — la troncature à `LIMITE_RESSOURCE` et `hasMore` restent calculés par `scanner`
 * (`limite: 100`), jamais par cette source. `nature: "referentiel"` (cache 1 h, 07 §5) permet à
 * `scanner`/`lirePageGardee` de servir une deuxième lecture identique depuis le cache, à coût nul.
 */
export function construireSourceListeUnique<T>(options: OptionsSourceListeUnique<T>): SourcePaginee<T> {
  return {
    id: options.id,
    nature: "referentiel",
    taillePage: 100,
    idElement: options.idDe,
    async lirePage(_position, budget) {
      const page = await options.lire(budget);
      options.avertissements.push(...page.avertissements);
      return { elements: page.resultats, suivant: null, totalSource: page.resultats.length };
    },
  };
}
