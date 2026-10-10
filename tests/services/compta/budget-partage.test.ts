import { describe, expect, it } from "vitest";
import { ficheTiers } from "../../../dist/index.js";
import { ctxDe, depsDe } from "./fixtures.js";

const DETAIL_CPT = {
  uuid: "u-2",
  name: "Tiers 2",
  number: "4010003",
  vatNumber: null,
  siret: null,
  isActive: true,
  types: null,
  contact: { email: null },
};

function pageTiers(n: number): { data: { uuid: string; name: string; number: string; vatNumber: null; siret: null; isActive: boolean; types: null }[]; take: number; skip: number; totalRecords: number } {
  const data = Array.from({ length: n }, (_, i) => ({
    uuid: `u-${i}`,
    name: `Tiers ${i}`,
    number: `400${1000 + i}`,
    vatNumber: null,
    siret: null,
    isActive: true,
    types: null,
  }));
  return { data, take: 100, skip: 0, totalRecords: n };
}

describe("fiche_tiers (id CPT) — D-T11-2 : un seul budget partagé entre résolution et détail", () => {
  it("budget suffisant (2) ⇒ résolution (1 appel) + détail (1 appel) tiennent dans le même budget", async () => {
    const deps = depsDe([{ status: 200, corps: pageTiers(5) }, { status: 200, corps: DETAIL_CPT }]);
    const ctx = ctxDe({ execution: { ...ctxDe().execution, budgetRestant: 2 } });
    const resultat = await ficheTiers(deps, ctx, { id: "u-2" });
    expect(resultat.appels_source).toBe(2);
    expect(resultat.tentatives).toBe(2);
  });

  it("budget de 1 : consommé par la résolution ⇒ le détail échoue sous le même budget (RESOLUTION_INCOMPLETE), jamais un budget neuf", async () => {
    const deps = depsDe([{ status: 200, corps: pageTiers(5) }]);
    const ctx = ctxDe({ execution: { ...ctxDe().execution, budgetRestant: 1 } });
    await expect(ficheTiers(deps, ctx, { id: "u-2" })).rejects.toMatchObject({
      erreur: { code: "RESOLUTION_INCOMPLETE" },
    });
    expect(deps.transport.appels).toHaveLength(1);
  });
});
