import type { Budget } from "../../http/budget.js";
import type { PageSource, PositionSource, SourcePaginee } from "../../pagination/source-page.js";

/** Page skip/take normalisée telle que renvoyée par les fonctions de liste de `hubbix-gescom` (02 §3). */
export interface PageSkipTake<E> {
  readonly resultats: readonly E[];
  readonly total_source: number | null;
  readonly renvoyes: number;
  readonly skip_renvoye: number;
}

/**
 * Construit une `SourcePaginee` (`src/pagination/source-page.ts`) à partir d'une fonction de
 * liste skip/take de l'adapter `hubbix-gescom` (T10b), pour réutiliser le moteur `scanner`/
 * `parcourir` du socle (T08/T11-1) sans dupliquer de boucle de pagination dans les services (07
 * §1 : les adapters ne font pas de boucle de pagination, les services n'en réimplémentent pas une
 * à la main non plus). `suivant` se fonde sur `total_source` quand connu (fin exacte), sinon sur
 * `renvoyes < taillePage` (page partielle ⇒ dernière page) : jamais de troisième heuristique.
 */
export function sourceDepuisSkipTake<E>(
  id: string,
  nature: "referentiel" | "transactionnel",
  taillePage: number,
  idElement: (element: E) => string,
  lire: (skip: number, take: number, budget: Budget) => Promise<PageSkipTake<E>>,
): SourcePaginee<E> {
  return {
    id,
    nature,
    taillePage,
    idElement,
    async lirePage(position: PositionSource, budget: Budget): Promise<PageSource<E>> {
      const skip = position === null ? 0 : (position["skip"] as number);
      const page = await lire(skip, taillePage, budget);
      const skipSuivant = skip + page.renvoyes;
      const termine =
        page.total_source !== null ? skipSuivant >= page.total_source : page.renvoyes < taillePage;
      return {
        elements: page.resultats,
        suivant: termine ? null : { skip: skipSuivant },
        totalSource: page.total_source,
      };
    },
  };
}
