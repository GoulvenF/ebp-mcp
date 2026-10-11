import type { Budget } from "../../http/budget.js";
import type { PositionSource, SourcePaginee } from "../../pagination/source-page.js";

/**
 * Élément enveloppé d'une source skip/take (D-T11-14) : `item` est la forme mappée déjà produite
 * par l'adapter, `brutEbp` l'élément source EBP validé aligné 1:1 (ou `null` si l'adapter n'a pas
 * fourni de brut pour cet élément), `id` l'identité stable précalculée une seule fois à la lecture
 * de page (jamais recalculée par `idElement`, invoqué plusieurs fois par élément par `scan.ts`).
 */
export interface ElementEnveloppe<T> {
  readonly item: T;
  readonly brutEbp: unknown;
  readonly id: string;
}

export interface PageAdapterSkipTake<T> {
  readonly resultats: T[];
  readonly total_source: number | null;
  readonly renvoyes: number;
  readonly avertissements: string[];
  readonly sourcesEbp?: readonly unknown[];
}

export interface OptionsSourceSkipTake<T> {
  readonly id: string;
  readonly nature: "referentiel" | "transactionnel";
  /** Identité stable d'un élément, calculée une seule fois par élément à la lecture de la page. */
  readonly idDe: (item: T) => string;
  readonly lirePage: (skip: number, take: number, budget: Budget) => Promise<PageAdapterSkipTake<T>>;
  /** Avertissements remontés par l'adapter, accumulés dans l'ordre de lecture des pages. */
  readonly avertissements: string[];
  readonly taillePage?: number;
  /** Appelé une fois par page réellement lue depuis la source (jamais sur un coup de cache, 07 §5). */
  readonly onPageLue?: () => void;
}

/**
 * Construit une `SourcePaginee` skip/take générique au-dessus d'un adapter CPT paginé (D-T11-5) :
 * avance `skip` du nombre réellement renvoyé, fin de source dès qu'une page renvoie moins que
 * `taillePage` ou est vide — aucune des routes utilisées par ce lot ne documente d'indicateur
 * `hasMore` fiable (02 §2), donc « page non pleine » est le seul signal de fin disponible ; cette
 * position avance toujours strictement (jamais répétée), ce qui satisfait les gardes de
 * `lirePageGardee` (page répétée / position inchangée).
 */
export function construireSourceSkipTake<T>(options: OptionsSourceSkipTake<T>): SourcePaginee<ElementEnveloppe<T>> {
  const taillePage = options.taillePage ?? 100;
  return {
    id: options.id,
    nature: options.nature,
    taillePage,
    idElement: (enveloppe) => enveloppe.id,
    async lirePage(position, budget) {
      options.onPageLue?.();
      const skip = position === null ? 0 : Number((position as Record<string, number>)["skip"] ?? 0);
      const page = await options.lirePage(skip, taillePage, budget);
      options.avertissements.push(...page.avertissements);
      const elements = page.resultats.map((item, index): ElementEnveloppe<T> => ({
        item,
        brutEbp: page.sourcesEbp?.[index] ?? null,
        id: options.idDe(item),
      }));
      const suivant: PositionSource =
        page.renvoyes === 0 || page.renvoyes < taillePage ? null : { skip: skip + page.renvoyes };
      return { elements, suivant, totalSource: page.total_source };
    },
  };
}
