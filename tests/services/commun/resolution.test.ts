import { describe, expect, it } from "vitest";
import { CacheSource, MagasinCurseurs, resoudreUnique } from "../../../dist/index.js";
import type { Budget, DepsScan, PageSource, PositionSource, SourcePaginee } from "../../../dist/index.js";
import { contexteTest, creerHorlogeControlee, creerSourceFactice, elements, identiteTest } from "../../pagination/fixtures.js";
import type { ElementFactice } from "../../pagination/fixtures.js";

const DEPART = new Date("2026-01-01T00:00:00.000Z");

function depsDe(horloge = creerHorlogeControlee(DEPART)): DepsScan {
  return { curseurs: new MagasinCurseurs(horloge), cache: new CacheSource(horloge), clock: horloge };
}

/** Taille de la table d'états du magasin de curseurs, lue directement pour prouver qu'elle reste vide. */
function tailleMagasinCurseurs(curseurs: MagasinCurseurs): number {
  return (curseurs as unknown as { etats: Map<string, unknown> }).etats.size;
}

/** Source consommant le budget à la lecture de page (comme le client HTTP réel), pour forcer une interruption. */
function creerSourceConsommantBudget(
  pages: PageSource<ElementFactice>[],
  coutParPage = 1,
): SourcePaginee<ElementFactice> & { readonly appels: number } {
  const file = [...pages];
  let appels = 0;
  return {
    id: "source-test:/resolution",
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

describe("resolution.ts — critère : 0 correspondance après scan complet ⇒ NOT_FOUND", () => {
  it("scan complet sans aucune correspondance", async () => {
    const page: PageSource<ElementFactice> = { elements: elements(1, 2, 3), suivant: null, totalSource: 3 };
    const source = creerSourceFactice([page]);
    const deps = depsDe();
    await expect(
      resoudreUnique(deps, {
        contexte: contexteTest(),
        source,
        identite: identiteTest(),
        correspond: () => false,
      }),
    ).rejects.toMatchObject({ erreur: { code: "NOT_FOUND" } });
  });
});

describe("resolution.ts — critère : 2 correspondances exactes ⇒ AMBIGUOUS_REFERENCE", () => {
  it("deux éléments correspondent exactement au prédicat", async () => {
    const page: PageSource<ElementFactice> = {
      elements: [
        { id: "x1", valeur: 1 },
        { id: "x2", valeur: 1 },
        { id: "x3", valeur: 99 },
      ],
      suivant: null,
      totalSource: 3,
    };
    const source = creerSourceFactice([page]);
    const deps = depsDe();
    await expect(
      resoudreUnique(deps, {
        contexte: contexteTest(),
        source,
        identite: identiteTest(),
        correspond: (e) => e.valeur === 1,
      }),
    ).rejects.toMatchObject({ erreur: { code: "AMBIGUOUS_REFERENCE" } });
  });
});

describe("resolution.ts — critère : un candidat trouvé puis source épuisée par budget ⇒ RESOLUTION_INCOMPLETE", () => {
  it("jamais NOT_FOUND ni succès quand l'interruption survient après une première correspondance", async () => {
    // Deux pages nécessaires ; budget suffisant pour une seule lecture de page.
    const page1: PageSource<ElementFactice> = {
      elements: [{ id: "cible", valeur: 1 }],
      suivant: { page: 2 },
      totalSource: 2,
    };
    const page2: PageSource<ElementFactice> = {
      elements: [{ id: "autre", valeur: 1 }],
      suivant: null,
      totalSource: 2,
    };
    const source = creerSourceConsommantBudget([page1, page2], 1);
    const deps = depsDe();

    await expect(
      resoudreUnique(deps, {
        contexte: contexteTest({ budgetRestant: 1 }),
        source,
        identite: identiteTest(),
        correspond: (e) => e.valeur === 1,
      }),
    ).rejects.toMatchObject({ erreur: { code: "RESOLUTION_INCOMPLETE" } });
    // Une seule page a pu être lue avant épuisement du budget.
    expect(source.appels).toBe(1);
  });
});

describe("resolution.ts — critère : égalité stricte, pas de normalisation côté appelant", () => {
  it("\"411\" ne matche pas \"411000\" : seul l'élément strictement égal est retenu", async () => {
    const page: PageSource<ElementFactice> = {
      elements: [
        { id: "411", valeur: 1 },
        { id: "411000", valeur: 2 },
      ],
      suivant: null,
      totalSource: 2,
    };
    const source = creerSourceFactice([page]);
    const deps = depsDe();
    const resultat = await resoudreUnique(deps, {
      contexte: contexteTest(),
      source,
      identite: identiteTest(),
      correspond: (e) => e.id === "411",
    });
    expect(resultat.id).toBe("411");
  });
});

describe("resolution.ts — critère : aucun curseur enregistré après l'appel (sansCurseur: true forcé)", () => {
  it("magasin de curseurs resté vide après un scan complet", async () => {
    const page: PageSource<ElementFactice> = { elements: elements(1, 2, 3), suivant: null, totalSource: 3 };
    const source = creerSourceFactice([page]);
    const deps = depsDe();
    await resoudreUnique(deps, {
      contexte: contexteTest(),
      source,
      identite: identiteTest(),
      correspond: (e) => e.id === "e1",
    });
    expect(tailleMagasinCurseurs(deps.curseurs as MagasinCurseurs)).toBe(0);
  });

  it("magasin de curseurs resté vide même après une interruption partielle (budget)", async () => {
    const page1: PageSource<ElementFactice> = {
      elements: [{ id: "cible", valeur: 1 }],
      suivant: { page: 2 },
      totalSource: 2,
    };
    const page2: PageSource<ElementFactice> = { elements: [{ id: "autre", valeur: 1 }], suivant: null, totalSource: 2 };
    const source = creerSourceConsommantBudget([page1, page2], 1);
    const deps = depsDe();
    await expect(
      resoudreUnique(deps, {
        contexte: contexteTest({ budgetRestant: 1 }),
        source,
        identite: identiteTest(),
        correspond: (e) => e.valeur === 1,
      }),
    ).rejects.toThrow();
    expect(tailleMagasinCurseurs(deps.curseurs as MagasinCurseurs)).toBe(0);
  });
});
