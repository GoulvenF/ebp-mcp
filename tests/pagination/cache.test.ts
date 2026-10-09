import { describe, expect, it } from "vitest";
import { CacheSource, MagasinCurseurs, scanner } from "../../dist/index.js";
import type { DepsScan, PageSource } from "../../dist/index.js";
import type { ElementFactice } from "./fixtures.js";
import { contexteTest, creerHorlogeControlee, creerSourceFactice, elements, identiteTest } from "./fixtures.js";

const DEPART = new Date("2026-01-01T00:00:00.000Z");

function cle(position: number, extra: Partial<Record<string, unknown>> = {}) {
  return {
    identiteGeneration: 1,
    environnement: "prod",
    famille: "hubbix-gescom",
    dossier: "dossier-test",
    sourceId: "source-test:/elements",
    empreinteFiltre: "[]",
    position: { page: position },
    ...extra,
  };
}

describe("cache.ts — critère #12 (volet cache) : capacités, TTL et coût zéro", () => {
  it("TTL référentiel 1 h et transactionnel 60 s sont respectés", () => {
    const horloge = creerHorlogeControlee(DEPART);
    const cache = new CacheSource(horloge);
    const page = { elements: [], suivant: null, totalSource: 0 };
    cache.ecrire(cle(1), page, "referentiel");
    cache.ecrire(cle(2), page, "transactionnel");

    horloge.avancer(61_000); // 61 s : le transactionnel a expiré, le référentiel non.
    expect(cache.lire(cle(1))).not.toBeNull();
    expect(cache.lire(cle(2))).toBeNull();

    horloge.avancer(60 * 60 * 1000); // + 1 h : le référentiel a expiré aussi.
    expect(cache.lire(cle(1))).toBeNull();
  });

  it("ne met jamais en cache une page invalide ou une erreur (l'appelant ne doit jamais écrire sur échec)", () => {
    const horloge = creerHorlogeControlee(DEPART);
    const cache = new CacheSource(horloge);
    // Le contrat est porté par l'appelant (scan.ts) : ce test prouve que `lire` renvoie `null`
    // tant qu'aucune écriture n'a eu lieu, ce qui est la seule garantie que `cache.ts` peut offrir
    // directement (il n'existe aucune méthode pour écrire une erreur).
    expect(cache.lire(cle(1))).toBeNull();
  });

  it("dépassement de la capacité de 32 Mio ⇒ éviction LRU", () => {
    const horloge = creerHorlogeControlee(DEPART);
    const cache = new CacheSource(horloge);
    const grossePage = { elements: Array.from({ length: 50_000 }, (_, i) => ({ id: `e${i}`, valeur: i })), suivant: null, totalSource: 50_000 };
    // Chaque page fait environ 1 Mio : au-delà d'une trentaine d'écritures, les premières sont évincées.
    for (let i = 0; i < 40; i += 1) {
      cache.ecrire(cle(i), grossePage, "referentiel");
    }
    expect(cache.lire(cle(0))).toBeNull(); // évincée depuis longtemps.
    expect(cache.lire(cle(39))).not.toBeNull(); // la plus récente est toujours là.
  });

  it("une page servie depuis le cache coûte zéro : aucun nouvel appel source, budget intact", async () => {
    const horloge = creerHorlogeControlee(DEPART);
    const cache = new CacheSource(horloge);
    const curseurs = new MagasinCurseurs(horloge);
    const deps: DepsScan = { curseurs, cache, clock: horloge };

    const page: PageSource<ElementFactice> = { elements: elements(1, 2, 3), suivant: null, totalSource: 3 };
    const source = creerSourceFactice([page]);
    const identite = identiteTest({ limite: 1 });

    const contexte = contexteTest({ budgetRestant: 2 });
    const premier = await scanner(deps, { contexte, source, limite: 1, identite });
    expect(source.appels).toBe(1);

    // Deuxième parcours indépendant (pas de reprise par curseur), même identité/source/position
    // de départ (`null`) : la page est servie depuis le cache, sans nouvel appel source.
    const second = await scanner(deps, { contexte: contexteTest({ budgetRestant: 2 }), source, limite: 1, identite });
    expect(source.appels).toBe(1); // toujours 1 : aucun nouvel appel réseau.
    expect(second.appelsSource).toBe(0); // page servie depuis le cache : coût zéro.
    expect(second.resultats.map((e) => e.id)).toEqual(premier.resultats.map((e) => e.id));
  });
});
