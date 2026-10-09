import { describe, expect, it } from "vitest";
import { CacheSource, MagasinCurseurs, scanner } from "../../dist/index.js";
import type { DepsScan, PageSource } from "../../dist/index.js";
import type { ElementFactice } from "./fixtures.js";
import { contexteTest, creerHorlogeControlee, creerSourceFactice, elements, identiteTest } from "./fixtures.js";

const DEPART = new Date("2026-01-01T00:00:00.000Z");

describe("invalidation auth (critère #11) : génération révoquée", () => {
  it("curseur purgé ⇒ CURSOR_EXPIRED à la reprise, sans réauthentification requise pour le relire", async () => {
    const horloge = creerHorlogeControlee(DEPART);
    const curseurs = new MagasinCurseurs(horloge);
    const cache = new CacheSource(horloge);
    const deps: DepsScan = { curseurs, cache, clock: horloge };

    const page1: PageSource<ElementFactice> = { elements: elements(1, 2, 3), suivant: { p: 2 }, totalSource: 10 };
    const source = creerSourceFactice([page1]);
    const identite = identiteTest({ limite: 1, identiteGeneration: 1 });
    const premier = await scanner(deps, {
      contexte: contexteTest({ identiteGeneration: 1 }),
      source,
      limite: 1,
      identite,
    });
    const token = premier.pagination.curseur as string;
    expect(token).not.toBeNull();

    // Logout / nouvelle génération : la génération 1 est révoquée.
    curseurs.purgerGeneration(1);

    await expect(
      scanner(deps, { contexte: contexteTest({ identiteGeneration: 1 }), source, limite: 1, curseur: token, identite }),
    ).rejects.toMatchObject({ erreur: { code: "CURSOR_EXPIRED" } });
  });

  it("entrées de cache de cette identité purgées ⇒ inutilisables, une nouvelle lecture source est nécessaire", async () => {
    const horloge = creerHorlogeControlee(DEPART);
    const curseurs = new MagasinCurseurs(horloge);
    const cache = new CacheSource(horloge);
    const deps: DepsScan = { curseurs, cache, clock: horloge };

    const page: PageSource<ElementFactice> = { elements: elements(1, 2, 3), suivant: null, totalSource: 3 };
    // Deux pages identiques programmées : la seconde n'est consommée que si le cache est bien
    // inutilisable après la purge (sinon la première suffirait et le test ne prouverait rien).
    const source = creerSourceFactice([page, { ...page }]);
    const identite = identiteTest({ limite: 1, identiteGeneration: 7 });

    const premier = await scanner(deps, {
      contexte: contexteTest({ identiteGeneration: 7 }),
      source,
      limite: 1,
      identite,
    });
    expect(source.appels).toBe(1);

    cache.purgerGeneration(7);

    const second = await scanner(deps, {
      contexte: contexteTest({ identiteGeneration: 7 }),
      source,
      limite: 1,
      identite,
    });
    expect(source.appels).toBe(2); // le cache purgé force une relecture réelle de la source.
    expect(second.resultats.map((e) => e.id)).toEqual(premier.resultats.map((e) => e.id));
  });
});
