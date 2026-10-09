import { describe, expect, it } from "vitest";
import {
  CacheSource,
  MagasinCurseurs,
  scanner,
} from "../../dist/index.js";
import type { DepsScan, PageSource } from "../../dist/index.js";
import type { ElementFactice } from "./fixtures.js";
import {
  contexteTest,
  creerHorlogeControlee,
  creerSourceFactice,
  elements,
  identiteTest,
} from "./fixtures.js";

const DEPART = new Date("2026-01-01T00:00:00.000Z");

function depsDe(horloge = creerHorlogeControlee(DEPART)): DepsScan {
  return { curseurs: new MagasinCurseurs(horloge), cache: new CacheSource(horloge), clock: horloge };
}

describe("scan.ts — critère #1 : page filtrée vers un sous-ensemble, une seule page lue", () => {
  it("page de 100 éléments filtrée vers 3 résultats : une seule page lue, renvoyes 3, total_source conservé", async () => {
    const tous = elements(...Array.from({ length: 100 }, (_, i) => i));
    const page: PageSource<ElementFactice> = { elements: tous, suivant: null, totalSource: 100 };
    const source = creerSourceFactice([page]);
    const resultat = await scanner(depsDe(), {
      contexte: contexteTest(),
      source,
      limite: 50,
      identite: identiteTest(),
      filtre: (e) => e.valeur === 1 || e.valeur === 2 || e.valeur === 3,
    });
    expect(source.appels).toBe(1);
    expect(resultat.pagination.renvoyes).toBe(3);
    expect(resultat.pagination.total_source).toBe(100);
    expect(resultat.completude).toBe("complete");
    expect(resultat.pagination.total).toBe(3);
  });
});

describe("scan.ts — critère #2 : limite atteinte au milieu d'une page, reprise sans perte ni doublon", () => {
  it("concaténation des deux appels redonne exactement la séquence filtrée attendue", async () => {
    // Page unique de 10 éléments, tous matchent le filtre ; limite=4 coupe la page en deux temps.
    const page: PageSource<ElementFactice> = { elements: elements(1, 2, 3, 4, 5, 6, 7, 8, 9, 10), suivant: null, totalSource: 10 };
    const source = creerSourceFactice([page]);
    const deps = depsDe();
    const identite = identiteTest({ limite: 4 });

    const premier = await scanner(deps, { contexte: contexteTest(), source, limite: 4, identite });
    expect(premier.resultats.map((e) => e.id)).toEqual(["e1", "e2", "e3", "e4"]);
    expect(premier.completude).toBe("page");
    expect(premier.raisonArret).toBe("limite");
    expect(premier.pagination.hasMore).toBe(true);
    expect(premier.pagination.curseur).not.toBeNull();
    expect(source.appels).toBe(1);

    const second = await scanner(deps, {
      contexte: contexteTest(),
      source,
      limite: 4,
      curseur: premier.pagination.curseur as string,
      identite,
    });
    expect(second.resultats.map((e) => e.id)).toEqual(["e5", "e6", "e7", "e8"]);
    expect(source.appels).toBe(1); // servi depuis le buffer, aucune nouvelle page lue.

    const concatenation = [...premier.resultats, ...second.resultats].map((e) => e.id);
    expect(concatenation).toEqual(["e1", "e2", "e3", "e4", "e5", "e6", "e7", "e8"]);
    expect(new Set(concatenation).size).toBe(concatenation.length);
  });
});

describe("scan.ts — critère #3 : page sans aucun match suivie d'une page avec matchs", () => {
  it("le moteur ne s'arrête pas sur une page vide de matchs, les deux pages sont lues", async () => {
    const pageVide: PageSource<ElementFactice> = { elements: elements(1, 2, 3), suivant: { page: 2 }, totalSource: 6 };
    const pageAvecMatch: PageSource<ElementFactice> = { elements: elements(4, 5, 6), suivant: null, totalSource: 6 };
    const source = creerSourceFactice([pageVide, pageAvecMatch]);
    const resultat = await scanner(depsDe(), {
      contexte: contexteTest(),
      source,
      limite: 50,
      identite: identiteTest(),
      filtre: (e) => e.valeur >= 4,
    });
    expect(source.appels).toBe(2);
    expect(resultat.resultats.map((e) => e.id)).toEqual(["e4", "e5", "e6"]);
    expect(resultat.completude).toBe("complete");
  });
});

describe("scan.ts — critère #4 : budget épuisé avec 0 résultat", () => {
  it("succès partiel, raison_arret budget, completude partielle, approximatif, avertissement, pas d'erreur", async () => {
    const page: PageSource<ElementFactice> = { elements: elements(1, 2, 3), suivant: null, totalSource: 3 };
    const source = creerSourceFactice([page]);
    const resultat = await scanner(depsDe(), {
      contexte: contexteTest({ budgetRestant: 0 }),
      source,
      limite: 50,
      identite: identiteTest(),
    });
    expect(resultat.resultats).toEqual([]);
    expect(resultat.raisonArret).toBe("budget");
    expect(resultat.completude).toBe("partielle");
    expect(resultat.approximatif).toBe(true);
    expect(resultat.avertissements.length).toBeGreaterThan(0);
    expect(source.appels).toBe(0);
  });
});

describe("scan.ts — critère #5 : total_source différent de total", () => {
  it("total filtré exact seulement en fin de parcours, null sinon", async () => {
    const page1: PageSource<ElementFactice> = { elements: elements(1, 2, 3, 4, 5), suivant: { p: 2 }, totalSource: 5000 };
    const page2: PageSource<ElementFactice> = { elements: elements(6, 7, 8), suivant: null, totalSource: 5000 };
    const source = creerSourceFactice([page1, page2]);
    const deps = depsDe();
    const identite = identiteTest({ limite: 4 });

    const premier = await scanner(deps, { contexte: contexteTest(), source, limite: 4, identite });
    expect(premier.pagination.total).toBeNull();
    expect(premier.pagination.total_source).toBe(5000);

    const second = await scanner(deps, {
      contexte: contexteTest(),
      source,
      limite: 4,
      curseur: premier.pagination.curseur as string,
      identite,
    });
    expect(second.completude).toBe("complete");
    expect(second.pagination.total).toBe(8);
    expect(second.pagination.total_source).toBe(5000);
    expect(second.pagination.total).not.toBe(second.pagination.total_source);
  });
});

describe("scan.ts — critère #6 : page répétée et position non avancée", () => {
  // Filtre sans aucun match : force le moteur à poursuivre la lecture de pages (critère #3)
  // jusqu'à atteindre la page invalide, sans que `limite` n'interrompe le parcours avant.
  const aucunMatch = () => false;

  it("position inchangée d'une page à la suivante ⇒ UPSTREAM_PAGINATION_INVALID", async () => {
    const position = { page: 1 };
    const page1: PageSource<ElementFactice> = { elements: elements(1, 2), suivant: position, totalSource: 10 };
    const pageBloquee: PageSource<ElementFactice> = { elements: elements(3, 4), suivant: position, totalSource: 10 };
    const source = creerSourceFactice([page1, pageBloquee]);
    await expect(
      scanner(depsDe(), {
        contexte: contexteTest(),
        source,
        limite: 10,
        identite: identiteTest({ limite: 10 }),
        filtre: aucunMatch,
      }),
    ).rejects.toMatchObject({ erreur: { code: "UPSTREAM_PAGINATION_INVALID" } });
  });

  it("page répétée (même ensemble d'idElement) avec position qui change pourtant ⇒ UPSTREAM_PAGINATION_INVALID", async () => {
    const page1: PageSource<ElementFactice> = { elements: elements(1, 2), suivant: { page: 2 }, totalSource: 10 };
    const pageIdentiqueAuContenuPrecedent: PageSource<ElementFactice> = {
      elements: elements(1, 2),
      suivant: { page: 3 },
      totalSource: 10,
    };
    const source = creerSourceFactice([page1, pageIdentiqueAuContenuPrecedent]);
    await expect(
      scanner(depsDe(), {
        contexte: contexteTest(),
        source,
        limite: 10,
        identite: identiteTest({ limite: 10 }),
        filtre: aucunMatch,
      }),
    ).rejects.toMatchObject({ erreur: { code: "UPSTREAM_PAGINATION_INVALID" } });
  });
});

describe("scan.ts — critère #13 : taille de sortie bornée et validation de `limite`", () => {
  it("jamais plus de `limite` résultats rendus même si la page en contient davantage", async () => {
    const page: PageSource<ElementFactice> = { elements: elements(1, 2, 3, 4, 5), suivant: null, totalSource: 5 };
    const source = creerSourceFactice([page]);
    const resultat = await scanner(depsDe(), {
      contexte: contexteTest(),
      source,
      limite: 2,
      identite: identiteTest({ limite: 2 }),
    });
    expect(resultat.resultats).toHaveLength(2);
    expect(resultat.pagination.renvoyes).toBe(2);
  });

  it("le moteur ne tamponne pas plus d'une page source au-delà des résultats rendus", async () => {
    const page1: PageSource<ElementFactice> = { elements: elements(1, 2, 3), suivant: { page: 2 }, totalSource: 6 };
    const page2: PageSource<ElementFactice> = { elements: elements(4, 5, 6), suivant: null, totalSource: 6 };
    const source = creerSourceFactice([page1, page2]);
    const resultat = await scanner(depsDe(), {
      contexte: contexteTest(),
      source,
      limite: 1,
      identite: identiteTest({ limite: 1 }),
    });
    expect(resultat.resultats).toHaveLength(1);
    // Une seule page lue : la limite est atteinte dès le premier élément de la première page.
    expect(source.appels).toBe(1);
  });

  it("limite hors 1..500 ⇒ INVALID_ARGUMENT avant tout appel source", async () => {
    const source = creerSourceFactice([]);
    await expect(
      scanner(depsDe(), { contexte: contexteTest(), source, limite: 0, identite: identiteTest({ limite: 0 }) }),
    ).rejects.toMatchObject({ erreur: { code: "INVALID_ARGUMENT" } });
    await expect(
      scanner(depsDe(), { contexte: contexteTest(), source, limite: 501, identite: identiteTest({ limite: 501 }) }),
    ).rejects.toMatchObject({ erreur: { code: "INVALID_ARGUMENT" } });
    expect(source.appels).toBe(0);
  });
});
