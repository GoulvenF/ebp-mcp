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

/**
 * Élément de scan portant, en plus de l'objet métier mappé, sa source EBP validée et sa clé de
 * position stable `skip`+index (D-T11-14). Calculée une fois dans `lirePage`, cette clé voyage
 * avec l'élément à travers le cache et le curseur du moteur (`src/pagination`) : aucun état
 * `sourcesParId`/`sourcesParElement` ne vit plus hors de la page ou du curseur, donc une page
 * servie depuis le cache ou reprise via un curseur conserve son alignement `bruts` 1:1 (correctif
 * revue PR#19, perte silencieuse constatée sur `inclure_brut` et sur `lister_reglements`).
 */
export interface ElementAvecSource<T> {
  readonly objet: T;
  readonly source: unknown;
  readonly cle: string;
}

/** Page skip/take étendue des éléments source validés, alignés 1:1 avec `resultats` (D-T11-14). */
export interface PageSkipTakeAvecSources<T> extends PageSkipTake<T> {
  readonly sourcesEbp: readonly unknown[];
}

/**
 * Variante de `sourceDepuisSkipTake` pour les listes qui doivent porter `inclure_brut` (D-T11-14).
 * `idObjet` fournit l'identité métier stable quand la source en documente une (articles,
 * documents, échéances) ; `null` quand aucune identité stable n'est prouvée (`/settlements`,
 * A14), auquel cas `idElement` retombe sur la clé de position `cle`, elle aussi stable d'un appel
 * à l'autre puisqu'elle voyage avec l'élément plutôt que d'être recalculée via un état externe.
 */
export function sourceDepuisSkipTakeAvecSource<T>(
  id: string,
  nature: "referentiel" | "transactionnel",
  taillePage: number,
  idObjet: (objet: T) => string | null,
  lire: (skip: number, take: number, budget: Budget) => Promise<PageSkipTakeAvecSources<T>>,
): SourcePaginee<ElementAvecSource<T>> {
  return {
    id,
    nature,
    taillePage,
    idElement: (element) => idObjet(element.objet) ?? element.cle,
    async lirePage(position: PositionSource, budget: Budget): Promise<PageSource<ElementAvecSource<T>>> {
      const skip = position === null ? 0 : (position["skip"] as number);
      const page = await lire(skip, taillePage, budget);
      const elements = page.resultats.map((objet, index) => ({
        objet,
        source: page.sourcesEbp[index] ?? null,
        cle: String(skip + index),
      }));
      const skipSuivant = skip + page.renvoyes;
      const termine =
        page.total_source !== null ? skipSuivant >= page.total_source : page.renvoyes < taillePage;
      return {
        elements,
        suivant: termine ? null : { skip: skipSuivant },
        totalSource: page.total_source,
      };
    },
  };
}
