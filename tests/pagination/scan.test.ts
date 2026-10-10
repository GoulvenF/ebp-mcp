import { describe, expect, it } from "vitest";
import {
  CacheSource,
  MagasinCurseurs,
  creerBudget,
  scanner,
} from "../../dist/index.js";
import type { Budget, DepsScan, PageSource } from "../../dist/index.js";
import type { ElementFactice } from "./fixtures.js";
import {
  contexteTest,
  creerHorlogeControlee,
  creerSourceFactice,
  creerSourceFacticeConsommantBudget,
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

describe("scan.ts — régression : budget épuisé par la lecture de page elle-même", () => {
  it("sans enrichissement, les éléments déjà tamponnés sont rendus même à budget épuisé", async () => {
    const page: PageSource<ElementFactice> = { elements: elements(1, 2, 3), suivant: null, totalSource: 3 };
    const source = creerSourceFacticeConsommantBudget([page]);
    const resultat = await scanner(depsDe(), {
      contexte: contexteTest({ budgetRestant: 1 }),
      source,
      limite: 50,
      identite: identiteTest(),
    });
    // La lecture de page a consommé le seul point de budget disponible ; rendre des éléments déjà
    // tamponnés ne coûte rien et ne doit pas être bloqué par ce garde.
    expect(resultat.resultats.map((e) => e.id)).toEqual(["e1", "e2", "e3"]);
    expect(resultat.completude).toBe("complete");
    expect(resultat.raisonArret).toBeNull();
  });

  it("avec enrichissement, le budget épuisé par la lecture de page interrompt avant l'enrichissement", async () => {
    const page: PageSource<ElementFactice> = { elements: elements(1, 2, 3), suivant: null, totalSource: 3 };
    const source = creerSourceFacticeConsommantBudget([page]);
    const resultat = await scanner(depsDe(), {
      contexte: contexteTest({ budgetRestant: 1 }),
      source,
      limite: 50,
      identite: identiteTest(),
      enrichir: async (e) => e,
    });
    expect(resultat.resultats).toEqual([]);
    expect(resultat.raisonArret).toBe("budget");
    expect(resultat.completude).toBe("partielle");
    expect(resultat.approximatif).toBe(true);
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

describe("scan.ts — régression : total_source n'est jamais écrasé par null", () => {
  it("une page ultérieure sans total_source conserve le dernier total annoncé", async () => {
    const page1: PageSource<ElementFactice> = { elements: elements(1, 2), suivant: { p: 2 }, totalSource: 42 };
    const page2: PageSource<ElementFactice> = { elements: elements(3, 4), suivant: null, totalSource: null };
    const source = creerSourceFactice([page1, page2]);
    const resultat = await scanner(depsDe(), {
      contexte: contexteTest(),
      source,
      limite: 50,
      identite: identiteTest(),
    });
    expect(resultat.pagination.total_source).toBe(42);
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

describe("scan.ts — D-T11-2 : budget partagé explicite entre deux appels de `scanner`", () => {
  it("deux appels successifs partageant le même `Budget` ne consomment jamais plus que le budget initial cumulé", async () => {
    const page1: PageSource<ElementFactice> = { elements: elements(1), suivant: null, totalSource: 1 };
    const page2: PageSource<ElementFactice> = { elements: elements(2), suivant: null, totalSource: 1 };
    const source1 = creerSourceFacticeConsommantBudget([page1], { coutParPage: 1 });
    const source2 = creerSourceFacticeConsommantBudget([page2], { coutParPage: 1 });
    const deps = depsDe();
    // Budget initial de 1 tentative seulement, explicitement partagé entre les deux appels.
    const budget: Budget = creerBudget(contexteTest({ budgetRestant: 1 }));

    const premier = await scanner(deps, {
      contexte: contexteTest(),
      budget,
      source: source1,
      limite: 50,
      identite: identiteTest(),
    });
    expect(premier.resultats.map((e) => e.id)).toEqual(["e1"]);
    expect(budget.restant).toBe(0);

    const second = await scanner(deps, {
      contexte: contexteTest(),
      budget,
      source: source2,
      limite: 50,
      identite: identiteTest(),
    });
    // Le budget partagé est déjà épuisé par le premier appel : le second ne lit aucune page.
    expect(source2.appels).toBe(0);
    expect(second.resultats).toEqual([]);
    expect(second.raisonArret).toBe("budget");
    expect(budget.restant).toBe(0);
  });
});

describe("scan.ts — D-T11-3 : `sansCurseur: true`", () => {
  it("hasMore vrai mais pagination.curseur reste null, rien n'est enregistré dans le magasin", async () => {
    const page: PageSource<ElementFactice> = { elements: elements(1, 2, 3), suivant: { page: 2 }, totalSource: 10 };
    const source = creerSourceFactice([page]);
    const deps = depsDe();
    const resultat = await scanner(deps, {
      contexte: contexteTest(),
      source,
      limite: 1,
      sansCurseur: true,
      identite: identiteTest({ limite: 1 }),
    });
    expect(resultat.pagination.hasMore).toBe(true);
    expect(resultat.pagination.curseur).toBeNull();
    expect((deps.curseurs as unknown as { etats: Map<string, unknown> }).etats.size).toBe(0);
  });
});

describe("scan.ts — D-T11-8 : `filtreApresEnrichissement`", () => {
  it("élément enrichi puis rejeté : absent de `resultats`, non compté dans `pagination.total`, jamais relu après reprise", async () => {
    const page1: PageSource<ElementFactice> = {
      elements: [
        { id: "rej", valeur: 1 },
        { id: "acc1", valeur: 2 },
      ],
      suivant: { page: 2 },
      totalSource: 4,
    };
    // La page 2 renvoie à nouveau "rej" (simule un chevauchement upstream) ainsi qu'un nouvel élément.
    const page2: PageSource<ElementFactice> = {
      elements: [
        { id: "rej", valeur: 1 },
        { id: "acc2", valeur: 2 },
      ],
      suivant: null,
      totalSource: 4,
    };
    const source = creerSourceFactice([page1, page2]);
    const deps = depsDe();
    const identite = identiteTest({ limite: 1 });

    const premier = await scanner(deps, {
      contexte: contexteTest(),
      source,
      limite: 1,
      identite,
      filtreApresEnrichissement: (e) => e.id !== "rej",
    });
    expect(premier.resultats.map((e) => e.id)).toEqual(["acc1"]);
    expect(premier.completude).toBe("page");
    expect(premier.pagination.curseur).not.toBeNull();

    const second = await scanner(deps, {
      contexte: contexteTest(),
      source,
      limite: 1,
      curseur: premier.pagination.curseur as string,
      identite,
      filtreApresEnrichissement: (e) => e.id !== "rej",
    });
    // "rej" a déjà été marqué vu lors du premier appel : il n'est jamais relu ni recompté.
    expect(second.resultats.map((e) => e.id)).toEqual(["acc2"]);
    expect(second.completude).toBe("complete");
    expect(second.pagination.total).toBe(2);
  });
});
