import { describe, expect, it } from "vitest";
import { CacheSource, MagasinCurseurs, scanner } from "../../dist/index.js";
import type { DepsScan, PageSource } from "../../dist/index.js";
import type { ElementFactice } from "./fixtures.js";
import { contexteTest, creerHorlogeControlee, creerSourceFactice, elements, identiteTest } from "./fixtures.js";

const DEPART = new Date("2026-01-01T00:00:00.000Z");
const PLAFOND_TEST = 1_048_576;

function depsDe(plafondOctetsResultats?: number): DepsScan {
  const horloge = creerHorlogeControlee(DEPART);
  return {
    curseurs: new MagasinCurseurs(horloge),
    cache: new CacheSource(horloge),
    clock: horloge,
    ...(plafondOctetsResultats !== undefined ? { plafondOctetsResultats } : {}),
  };
}

describe("scan.ts — D-T12-9 : plafond de taille des résultats", () => {
  it("liste dont les résultats dépassent le plafond : coupée, hasMore, completude page, avertissement dédié", async () => {
    const page: PageSource<ElementFactice> = { elements: elements(1, 2, 3, 4, 5), suivant: null, totalSource: 5 };
    const source = creerSourceFactice([page]);
    const deps = depsDe(PLAFOND_TEST);
    const resultat = await scanner(deps, {
      contexte: contexteTest(),
      source,
      limite: 50,
      identite: identiteTest(),
      tailleNormalisee: () => 400_000,
    });
    expect(resultat.resultats.map((e) => e.id)).toEqual(["e1", "e2"]);
    expect(resultat.pagination.hasMore).toBe(true);
    expect(resultat.completude).toBe("page");
    expect(resultat.raisonArret).toBeNull();
    expect(resultat.avertissements.some((a) => a.includes("liste coupée à 2 résultats"))).toBe(true);
    expect(resultat.pagination.curseur).not.toBeNull();
  });

  it("la reprise par curseur rend la suite sans perte ni doublon", async () => {
    const page: PageSource<ElementFactice> = { elements: elements(1, 2, 3, 4, 5), suivant: null, totalSource: 5 };
    const source = creerSourceFactice([page]);
    const deps = depsDe(PLAFOND_TEST);
    const identite = identiteTest();
    const options = { contexte: contexteTest(), source, limite: 50, identite, tailleNormalisee: () => 400_000 };

    const premier = await scanner(deps, options);
    const second = await scanner(deps, { ...options, curseur: premier.pagination.curseur as string });
    const troisieme = await scanner(deps, { ...options, curseur: second.pagination.curseur as string });

    expect(troisieme.pagination.hasMore).toBe(false);
    expect(troisieme.completude).toBe("complete");
    const concatenation = [...premier.resultats, ...second.resultats, ...troisieme.resultats].map((e) => e.id);
    expect(concatenation).toEqual(["e1", "e2", "e3", "e4", "e5"]);
    expect(new Set(concatenation).size).toBe(concatenation.length);
    expect(source.appels).toBe(1); // une seule page distante lue, le reste vient du buffer repris.
  });

  it("le brut n'entre pas dans la mesure de la liste : une mesure qui l'exclut ne coupe pas la liste", async () => {
    const page: PageSource<ElementFactice> = { elements: elements(1, 2, 3), suivant: null, totalSource: 3 };
    const source = creerSourceFactice([page]);
    const deps = depsDe(PLAFOND_TEST);
    // Chaque résultat porterait, mesuré naïvement avec son brut, largement plus que le plafond ;
    // `tailleNormalisee` ne mesure que la partie normalisée (`valeur`), jamais `brut`.
    const resultat = await scanner(deps, {
      contexte: contexteTest(),
      source,
      limite: 50,
      identite: identiteTest(),
      projeter: (e) => ({ valeur: e.valeur, brut: "x".repeat(600_000) }),
      tailleNormalisee: (r) => JSON.stringify(r.valeur).length,
    });
    expect(resultat.resultats).toHaveLength(3);
    expect(resultat.completude).toBe("complete");
  });

  it("élément de liste seul au-delà du plafond : RESPONSE_TOO_LARGE", async () => {
    const page: PageSource<ElementFactice> = { elements: elements(1), suivant: null, totalSource: 1 };
    const source = creerSourceFactice([page]);
    const deps = depsDe(PLAFOND_TEST);
    await expect(
      scanner(deps, {
        contexte: contexteTest(),
        source,
        limite: 50,
        identite: identiteTest(),
        tailleNormalisee: () => PLAFOND_TEST + 1,
      }),
    ).rejects.toMatchObject({ erreur: { code: "RESPONSE_TOO_LARGE" } });
  });

  it("comportement inchangé si `plafondOctetsResultats` est absent : aucune coupure même pour des résultats volumineux", async () => {
    const page: PageSource<ElementFactice> = { elements: elements(1, 2, 3), suivant: null, totalSource: 3 };
    const source = creerSourceFactice([page]);
    const deps = depsDe(); // pas de plafond configuré.
    const resultat = await scanner(deps, {
      contexte: contexteTest(),
      source,
      limite: 50,
      identite: identiteTest(),
      tailleNormalisee: () => PLAFOND_TEST + 1,
    });
    expect(resultat.resultats).toHaveLength(3);
    expect(resultat.completude).toBe("complete");
  });
});
