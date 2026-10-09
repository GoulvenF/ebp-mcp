import { describe, expect, it } from "vitest";
import { CacheSource, MagasinCurseurs, scanner } from "../../dist/index.js";
import type { DepsScan, EtatCurseur, PageSource } from "../../dist/index.js";
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

function etatVide(): EtatCurseur<ElementFactice> {
  return {
    position: null,
    elementsEnAttente: [],
    idsVus: new Set<string>(),
    idsDernierePage: [],
    totalFiltreAccumule: 0,
    totalSourceConnu: null,
    sourceTerminee: false,
  };
}

describe("curseurs.ts — critère #7 : curseur expiré (TTL dépassé via l'horloge injectée)", () => {
  it("reprise après 15 minutes ⇒ CURSOR_EXPIRED", async () => {
    const horloge = creerHorlogeControlee(DEPART);
    const deps = depsDe(horloge);
    const page1: PageSource<ElementFactice> = { elements: elements(1, 2, 3), suivant: { p: 2 }, totalSource: 10 };
    const source = creerSourceFactice([page1]);
    const identite = identiteTest({ limite: 1 });
    const premier = await scanner(deps, { contexte: contexteTest(), source, limite: 1, identite });
    expect(premier.pagination.curseur).not.toBeNull();

    horloge.avancer(15 * 60 * 1000 + 1);

    await expect(
      scanner(deps, {
        contexte: contexteTest(),
        source,
        limite: 1,
        curseur: premier.pagination.curseur as string,
        identite,
      }),
    ).rejects.toMatchObject({ erreur: { code: "CURSOR_EXPIRED" } });
  });
});

describe("curseurs.ts — critère #8 : curseur d'un autre dossier", () => {
  it("reprise avec un dossier différent ⇒ CURSOR_MISMATCH", async () => {
    const deps = depsDe();
    const page1: PageSource<ElementFactice> = { elements: elements(1, 2, 3), suivant: { p: 2 }, totalSource: 10 };
    const source = creerSourceFactice([page1]);
    const identiteA = identiteTest({ limite: 1, dossier: "dossier-a" });
    const premier = await scanner(deps, { contexte: contexteTest(), source, limite: 1, identite: identiteA });

    const identiteB = identiteTest({ limite: 1, dossier: "dossier-b" });
    await expect(
      scanner(deps, {
        contexte: contexteTest(),
        source,
        limite: 1,
        curseur: premier.pagination.curseur as string,
        identite: identiteB,
      }),
    ).rejects.toMatchObject({ erreur: { code: "CURSOR_MISMATCH" } });
  });
});

describe("curseurs.ts — critère #9 : curseur avec autres filtres / autre limite", () => {
  it("reprise avec des filtres différents ⇒ CURSOR_MISMATCH", async () => {
    const deps = depsDe();
    const page1: PageSource<ElementFactice> = { elements: elements(1, 2, 3), suivant: { p: 2 }, totalSource: 10 };
    const source = creerSourceFactice([page1]);
    const identiteA = identiteTest({ limite: 1, filtres: { type: "a" } });
    const premier = await scanner(deps, { contexte: contexteTest(), source, limite: 1, identite: identiteA });

    const identiteFiltresDifferents = identiteTest({ limite: 1, filtres: { type: "b" } });
    await expect(
      scanner(deps, {
        contexte: contexteTest(),
        source,
        limite: 1,
        curseur: premier.pagination.curseur as string,
        identite: identiteFiltresDifferents,
      }),
    ).rejects.toMatchObject({ erreur: { code: "CURSOR_MISMATCH" } });
  });

  it("reprise avec une limite différente ⇒ CURSOR_MISMATCH", async () => {
    const deps = depsDe();
    const page1: PageSource<ElementFactice> = { elements: elements(1, 2, 3), suivant: { p: 2 }, totalSource: 10 };
    const source = creerSourceFactice([page1]);
    const identiteA = identiteTest({ limite: 1 });
    const premier = await scanner(deps, { contexte: contexteTest(), source, limite: 1, identite: identiteA });

    const identiteLimiteDifferente = identiteTest({ limite: 2 });
    await expect(
      scanner(deps, {
        contexte: contexteTest(),
        source,
        limite: 2,
        curseur: premier.pagination.curseur as string,
        identite: identiteLimiteDifferente,
      }),
    ).rejects.toMatchObject({ erreur: { code: "CURSOR_MISMATCH" } });
  });
});

describe("curseurs.ts — critère #10 : double consommation", () => {
  it("usage concurrent ⇒ CURSOR_BUSY ; jamais une seconde page silencieuse", async () => {
    const deps = depsDe();
    const page1: PageSource<ElementFactice> = { elements: elements(1, 2, 3), suivant: { p: 2 }, totalSource: 10 };
    const page2: PageSource<ElementFactice> = { elements: elements(4, 5, 6), suivant: null, totalSource: 10 };
    const source = creerSourceFactice([page1, page2]);
    const identite = identiteTest({ limite: 1 });
    const premier = await scanner(deps, { contexte: contexteTest(), source, limite: 1, identite });
    const token = premier.pagination.curseur as string;
    expect(token).not.toBeNull();

    // Deux reprises lancées « en même temps » sur le même jeton : la première consomme
    // synchronement l'état avant que la seconde ne s'exécute.
    const appelConcurrent1 = scanner(deps, { contexte: contexteTest(), source, limite: 1, curseur: token, identite });
    const appelConcurrent2 = scanner(deps, { contexte: contexteTest(), source, limite: 1, curseur: token, identite });

    await expect(appelConcurrent2).rejects.toMatchObject({ erreur: { code: "CURSOR_BUSY" } });
    const resultatConcurrent1 = await appelConcurrent1;
    expect(resultatConcurrent1.resultats.map((e) => e.id)).toEqual(["e2"]);
  });

  it("réutilisation d'un jeton déjà consommé ⇒ CURSOR_EXPIRED, jamais une seconde page silencieuse", async () => {
    const deps = depsDe();
    const page1: PageSource<ElementFactice> = { elements: elements(1, 2, 3), suivant: { p: 2 }, totalSource: 10 };
    const page2: PageSource<ElementFactice> = { elements: elements(4, 5, 6), suivant: null, totalSource: 10 };
    const source = creerSourceFactice([page1, page2]);
    const identite = identiteTest({ limite: 1 });
    const premier = await scanner(deps, { contexte: contexteTest(), source, limite: 1, identite });
    const token = premier.pagination.curseur as string;

    const second = await scanner(deps, { contexte: contexteTest(), source, limite: 1, curseur: token, identite });
    expect(second.resultats.map((e) => e.id)).toEqual(["e2"]);

    await expect(
      scanner(deps, { contexte: contexteTest(), source, limite: 1, curseur: token, identite }),
    ).rejects.toMatchObject({ erreur: { code: "CURSOR_EXPIRED" } });
  });
});

describe("curseurs.ts — critère #12 (volet curseurs) : capacités mémoire", () => {
  it("101e état enregistré ⇒ éviction LRU, puis CURSOR_EXPIRED sur l'état évincé", () => {
    const horloge = creerHorlogeControlee(DEPART);
    const magasin = new MagasinCurseurs(horloge);
    const tokens: string[] = [];
    for (let i = 0; i < 100; i += 1) {
      const token = magasin.enregistrer(`empreinte-${i}`, 1, etatVide());
      expect(token).not.toBeNull();
      tokens.push(token as string);
    }
    const tokenEvince = tokens[0] as string;
    const token101 = magasin.enregistrer("empreinte-100", 1, etatVide());
    expect(token101).not.toBeNull();

    let erreurEvincee: unknown;
    try {
      magasin.consommer(tokenEvince, "empreinte-0");
    } catch (erreur) {
      erreurEvincee = erreur;
    }
    expect(erreurEvincee).toMatchObject({ erreur: { code: "CURSOR_EXPIRED" } });
    // Le 101e état, lui, reste consommable normalement.
    expect(() => magasin.consommer(token101 as string, "empreinte-100")).not.toThrow();
  });

  it("enregistrement impossible (état seul au-delà de la capacité en octets) ⇒ null (cursor_capacity)", () => {
    const horloge = creerHorlogeControlee(DEPART);
    const magasin = new MagasinCurseurs(horloge);
    const etatEnorme: EtatCurseur<ElementFactice> = {
      ...etatVide(),
      elementsEnAttente: Array.from({ length: 2_000_000 }, (_, i) => ({ id: `e${i}`, valeur: i })),
    };
    const token = magasin.enregistrer("empreinte-enorme", 1, etatEnorme);
    expect(token).toBeNull();
  });
});
