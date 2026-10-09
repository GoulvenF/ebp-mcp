import type { Budget } from "../../dist/index.js";
import type { PageSource, PositionSource, SourcePaginee } from "../../dist/index.js";

export { creerHorlogeControlee, type HorlogeControlee } from "../auth/fixtures.js";

/** Élément factice déterministe, sans rapport avec un objet métier EBP réel. */
export interface ElementFactice {
  readonly id: string;
  readonly valeur: number;
}

export function elements(...ids: number[]): ElementFactice[] {
  return ids.map((id) => ({ id: `e${id}`, valeur: id }));
}

/**
 * Source paginée factice : consomme une liste de pages programmées dans l'ordre, une par appel
 * de `lirePage`. Ne fait aucun appel réseau. `position` reçue est ignorée pour le choix de la
 * page (déterminisme du test), mais conservée dans `positionsRecues` pour les assertions.
 */
export function creerSourceFactice(
  pages: PageSource<ElementFactice>[],
  options: { id?: string; nature?: "referentiel" | "transactionnel" } = {},
): SourcePaginee<ElementFactice> & { readonly positionsRecues: PositionSource[]; readonly appels: number } {
  const file = [...pages];
  const positionsRecues: PositionSource[] = [];
  let appels = 0;
  return {
    id: options.id ?? "source-test:/elements",
    nature: options.nature ?? "transactionnel",
    taillePage: 100,
    positionsRecues,
    get appels() {
      return appels;
    },
    async lirePage(position: PositionSource): Promise<PageSource<ElementFactice>> {
      positionsRecues.push(position);
      appels += 1;
      const page = file.shift();
      if (page === undefined) {
        throw new Error("Source factice : aucune page programmée (appel inattendu).");
      }
      return page;
    },
    idElement(element: ElementFactice): string {
      return element.id;
    },
  };
}

/**
 * Source paginée factice consommant le budget à la lecture de page, comme le fait le client HTTP
 * réel (`src/http/client.ts`) : reproduit les scénarios où le budget s'épuise pendant la lecture
 * elle-même plutôt qu'entre deux pages.
 */
export function creerSourceFacticeConsommantBudget(
  pages: PageSource<ElementFactice>[],
  options: { id?: string; nature?: "referentiel" | "transactionnel"; coutParPage?: number } = {},
): SourcePaginee<ElementFactice> & { readonly appels: number } {
  const file = [...pages];
  const cout = options.coutParPage ?? 1;
  let appels = 0;
  return {
    id: options.id ?? "source-test:/elements",
    nature: options.nature ?? "transactionnel",
    taillePage: 100,
    get appels() {
      return appels;
    },
    async lirePage(_position: PositionSource, budget: Budget): Promise<PageSource<ElementFactice>> {
      appels += 1;
      budget.consommer(cout);
      const page = file.shift();
      if (page === undefined) {
        throw new Error("Source factice : aucune page programmée (appel inattendu).");
      }
      return page;
    },
    idElement(element: ElementFactice): string {
      return element.id;
    },
  };
}

export function identiteTest(overrides: Partial<Record<string, unknown>> = {}): {
  outil: string;
  profil: string;
  identiteGeneration: number;
  environnement: "prod" | "preprod";
  famille: "hubbix-compta" | "hubbix-gescom";
  dossier: string | null;
  limite: number;
  filtres?: unknown;
  tri?: unknown;
  projection?: unknown;
} {
  return {
    outil: "outil-test",
    profil: "profil-test",
    identiteGeneration: 1,
    environnement: "prod",
    famille: "hubbix-gescom",
    dossier: "dossier-test",
    limite: 50,
    ...overrides,
  };
}

export function contexteTest(overrides: Partial<Record<string, unknown>> = {}): {
  profil: string;
  environnement: "prod" | "preprod";
  identiteGeneration: number;
  dossier: string | null;
  budgetRestant: number;
  deadline: Date;
  signal: AbortSignal;
} {
  return {
    profil: "profil-test",
    environnement: "prod",
    identiteGeneration: 1,
    dossier: "dossier-test",
    budgetRestant: 30,
    deadline: new Date("2026-01-01T00:01:00.000Z"),
    signal: new AbortController().signal,
    ...overrides,
  };
}
