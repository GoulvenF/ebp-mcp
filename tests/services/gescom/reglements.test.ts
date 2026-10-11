import { describe, expect, it } from "vitest";
import { listerReglementsService } from "../../../dist/index.js";
import { ctxComptaSurOutilGc, ctxGescom, depsService } from "./fixtures.js";

function reglement(code: string, overrides: Record<string, unknown> = {}) {
  return {
    code,
    date: "2026-02-10",
    customerName: "Client Alpha",
    amount: "100.00",
    stillToBeDistributedAmount: "0.00",
    paymentModeLabel: "Chèque",
    paymentReference: "CHQ1",
    settlementType: 1,
    ...overrides,
  };
}

function page(elements: unknown[]) {
  return { elements, take: 50, skip: 0, total: elements.length };
}

describe("services/gescom/reglements.ts — garde de famille (D-T11-1, A03)", () => {
  it("lister_reglements sur dossier CPT ⇒ UNSUPPORTED_CAPABILITY, 0 appel transport", async () => {
    const d = depsService([]);
    await expect(listerReglementsService(d, ctxComptaSurOutilGc(), {})).rejects.toMatchObject({
      erreur: { code: "UNSUPPORTED_CAPABILITY" },
    });
    expect(d.transport.appels).toHaveLength(0);
  });
});

describe("services/gescom/reglements.ts — filtre `tiers` (D-T11-10/A14)", () => {
  it("`tiers` ⇒ refus avant tout réseau, y compris avant lecture du cache", async () => {
    const d = depsService([]);
    await expect(listerReglementsService(d, ctxGescom(), { tiers: "tiers-1" })).rejects.toMatchObject({
      erreur: { code: "UNSUPPORTED_CAPABILITY" },
    });
    expect(d.transport.appels).toHaveLength(0);
  });
});

describe("services/gescom/reglements.ts — `non_affectes` (décimal)", () => {
  it("ne conserve que les règlements dont le reste à affecter est strictement positif", async () => {
    const d = depsService([
      {
        status: 200,
        corps: page([
          reglement("RG-1", { stillToBeDistributedAmount: "0.00" }),
          reglement("RG-2", { stillToBeDistributedAmount: "12.50" }),
        ]),
      },
    ]);
    const resultat = await listerReglementsService(d, ctxGescom(), { non_affectes: true });
    expect(resultat.resultats.map((r) => r.code)).toEqual(["RG-2"]);
  });

  it("montant restant à affecter `null` ⇒ exclu, résultat `approximatif`", async () => {
    const d = depsService([{ status: 200, corps: page([reglement("RG-1", { stillToBeDistributedAmount: null })]) }]);
    const resultat = await listerReglementsService(d, ctxGescom(), { non_affectes: true });
    expect(resultat.resultats).toHaveLength(0);
    expect(resultat.approximatif).toBe(true);
  });

  it("`tiers_id` reste toujours `null` (A14), même si `customerName` est connu", async () => {
    const d = depsService([{ status: 200, corps: page([reglement("RG-1")]) }]);
    const resultat = await listerReglementsService(d, ctxGescom(), {});
    expect(resultat.resultats[0]).toMatchObject({ tiers_id: null, tiers_nom: "Client Alpha" });
  });
});

describe("services/gescom/reglements.ts — `inclure_brut` (D-T11-14, correctif revue PR#19)", () => {
  it("`inclure_brut: true` ⇒ `bruts` aligné 1:1 avec `resultats`", async () => {
    const d = depsService([{ status: 200, corps: page([reglement("RG-1")]) }]);
    const resultat = await listerReglementsService(d, ctxGescom(), { inclure_brut: true });
    expect(resultat.bruts).toHaveLength(resultat.resultats.length);
    expect(resultat.bruts![0]).toMatchObject({ code: "RG-1" });
  });

  it("second appel identique servi par le cache avec `inclure_brut: true` ⇒ `bruts` non nuls et alignés", async () => {
    const d = depsService([{ status: 200, corps: page([reglement("RG-1")]) }]);

    const premier = await listerReglementsService(d, ctxGescom(), { inclure_brut: false });
    expect(premier.bruts).toBeNull();
    expect(d.transport.appels).toHaveLength(1);

    const second = await listerReglementsService(d, ctxGescom(), { inclure_brut: true });
    // Page servie depuis le cache : aucun appel transport de plus.
    expect(d.transport.appels).toHaveLength(1);
    expect(second.resultats.map((r) => r.code)).toEqual(["RG-1"]);
    expect(second.bruts).toHaveLength(1);
    expect(second.bruts![0]).toMatchObject({ code: "RG-1" });
  });

  it("150 règlements sur 2 pages, appelé deux fois ⇒ même total, `completude: \"complete\"` (ex-régression : clé `idElement` écrasée à `\"inconnu\"` sur cache)", async () => {
    const page1 = {
      elements: Array.from({ length: 100 }, (_, i) => reglement(`RG-${i}`)),
      take: 100,
      skip: 0,
      total: 150,
    };
    const page2 = {
      elements: Array.from({ length: 50 }, (_, i) => reglement(`RG-${100 + i}`)),
      take: 100,
      skip: 100,
      total: 150,
    };
    const d = depsService([
      { status: 200, corps: page1 },
      { status: 200, corps: page2 },
    ]);

    const premier = await listerReglementsService(d, ctxGescom(), { limite: 500 });
    expect(premier.resultats).toHaveLength(150);
    expect(premier.completude).toBe("complete");
    expect(d.transport.appels).toHaveLength(2);

    // Deuxième appel identique : les deux pages viennent du cache (0 appel transport de plus),
    // `/settlements` n'ayant aucun identifiant stable, la clé de position doit rester distincte
    // par élément même quand la page est servie depuis le cache.
    const second = await listerReglementsService(d, ctxGescom(), { limite: 500 });
    expect(d.transport.appels).toHaveLength(2);
    expect(second.resultats).toHaveLength(150);
    expect(second.completude).toBe("complete");
  });
});
