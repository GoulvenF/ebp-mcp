import { describe, expect, it } from "vitest";
import { CacheSource, MagasinCurseurs, parcourir } from "../../dist/index.js";
import type { Budget, DepsScan, PageSource, PositionSource, SourcePaginee } from "../../dist/index.js";
import type { ElementFactice } from "./fixtures.js";
import { contexteTest, creerHorlogeControlee, creerSourceFactice, elements, identiteTest } from "./fixtures.js";

const DEPART = new Date("2026-01-01T00:00:00.000Z");

function depsDe(horloge = creerHorlogeControlee(DEPART)): DepsScan {
  return { curseurs: new MagasinCurseurs(horloge), cache: new CacheSource(horloge), clock: horloge };
}

/** Identité minimale d'un parcours d'agrégat (D-T11-12), sans `limite`. */
function identiteParcoursTest(overrides: Partial<Record<string, unknown>> = {}) {
  const { limite, ...reste } = identiteTest(overrides);
  void limite;
  return reste;
}

function creerSourceConsommantBudget(
  pages: PageSource<ElementFactice>[],
  coutParPage = 1,
): SourcePaginee<ElementFactice> & { readonly appels: number } {
  const file = [...pages];
  let appels = 0;
  return {
    id: "source-test:/agregat",
    nature: "transactionnel",
    taillePage: 100,
    get appels() {
      return appels;
    },
    async lirePage(_position: PositionSource, budget: Budget): Promise<PageSource<ElementFactice>> {
      appels += 1;
      budget.consommer(coutParPage);
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

describe("agregat.ts — critère : parcours complet sur plusieurs pages", () => {
  it("elementsParcourus cumule toutes les pages, completude complete, pas de champ `pagination`", async () => {
    const page1: PageSource<ElementFactice> = { elements: elements(1, 2, 3), suivant: { page: 2 }, totalSource: 5 };
    const page2: PageSource<ElementFactice> = { elements: elements(4, 5), suivant: null, totalSource: 5 };
    const source = creerSourceFactice([page1, page2]);
    const vus: string[] = [];

    const resultat = await parcourir(depsDe(), {
      contexte: contexteTest(),
      source,
      identite: identiteParcoursTest(),
      surElement: (e) => {
        vus.push(e.id);
      },
    });

    expect(resultat.elementsParcourus).toBe(5);
    expect(vus).toEqual(["e1", "e2", "e3", "e4", "e5"]);
    expect(resultat.completude).toBe("complete");
    expect(resultat.raisonArret).toBeNull();
    expect(resultat.approximatif).toBe(false);
    expect(source.appels).toBe(2);
    expect(resultat).not.toHaveProperty("pagination");
  });
});

describe("agregat.ts — critère : page répétée ⇒ UPSTREAM_PAGINATION_INVALID propagée, jamais absorbée", () => {
  it("rejette avec le code UPSTREAM_PAGINATION_INVALID, pas de résultat partiel silencieux", async () => {
    const page1: PageSource<ElementFactice> = { elements: elements(1, 2), suivant: { page: 2 }, totalSource: 10 };
    const pageIdentiqueAuContenuPrecedent: PageSource<ElementFactice> = {
      elements: elements(1, 2),
      suivant: { page: 3 },
      totalSource: 10,
    };
    const source = creerSourceFactice([page1, pageIdentiqueAuContenuPrecedent]);
    await expect(
      parcourir(depsDe(), {
        contexte: contexteTest(),
        source,
        identite: identiteParcoursTest(),
        surElement: () => {},
      }),
    ).rejects.toMatchObject({ erreur: { code: "UPSTREAM_PAGINATION_INVALID" } });
  });
});

describe("agregat.ts — critère : budget épuisé en cours de route", () => {
  it("completude partielle, raisonArret renseigné, approximatif true, éléments déjà traités conservés", async () => {
    const page1: PageSource<ElementFactice> = { elements: elements(1, 2), suivant: { page: 2 }, totalSource: 4 };
    const page2: PageSource<ElementFactice> = { elements: elements(3, 4), suivant: null, totalSource: 4 };
    const source = creerSourceConsommantBudget([page1, page2], 1);
    const vus: string[] = [];

    const resultat = await parcourir(depsDe(), {
      contexte: contexteTest({ budgetRestant: 1 }),
      source,
      identite: identiteParcoursTest(),
      surElement: (e) => {
        vus.push(e.id);
      },
    });

    expect(vus).toEqual(["e1", "e2"]);
    expect(resultat.elementsParcourus).toBe(2);
    expect(resultat.completude).toBe("partielle");
    expect(resultat.raisonArret).toBe("budget");
    expect(resultat.approximatif).toBe(true);
    // Seule la première page a pu être lue avant épuisement du budget.
    expect(source.appels).toBe(1);
  });
});

describe("agregat.ts — critère : une erreur non reconnue par raisonArretDepuisErreur est propagée telle quelle", () => {
  it("une erreur UNAUTHORIZED quelconque levée par la source n'est jamais absorbée en arrêt partiel", async () => {
    const erreurAuth = Object.assign(new Error("Authentification refusée"), {
      erreur: { code: "AUTH_REQUIRED", message: "Authentification refusée", action: "Se reconnecter." },
    });
    const source: SourcePaginee<ElementFactice> = {
      id: "source-test:/agregat-auth",
      nature: "transactionnel",
      taillePage: 100,
      async lirePage(_position: PositionSource, _budget: Budget): Promise<PageSource<ElementFactice>> {
        throw erreurAuth;
      },
      idElement(element: ElementFactice): string {
        return element.id;
      },
    };

    await expect(
      parcourir(depsDe(), {
        contexte: contexteTest(),
        source,
        identite: identiteParcoursTest(),
        surElement: () => {},
      }),
    ).rejects.toBe(erreurAuth);
  });
});
