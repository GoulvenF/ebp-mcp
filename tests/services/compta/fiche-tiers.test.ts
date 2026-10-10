import { describe, expect, it } from "vitest";
import { ficheTiers } from "../../../dist/index.js";
import { ctxDe, ctxGcDe, depsDe } from "./fixtures.js";

const DETAIL_CPT = {
  uuid: "u-1",
  name: "Café Dupont",
  number: "4010001",
  vatNumber: null,
  siret: null,
  isActive: true,
  types: null,
  contact: { email: null },
};

function pageTiers(n: number, idCible: string | null, compteCible = "4010001"): {
  data: { uuid: string; name: string; number: string; vatNumber: null; siret: null; isActive: boolean; types: null }[];
  take: number;
  skip: number;
  totalRecords: number;
} {
  const data = Array.from({ length: n }, (_, i) => ({
    uuid: `u-${i}`,
    name: `Tiers ${i}`,
    number: `400${1000 + i}`,
    vatNumber: null,
    siret: null,
    isActive: true,
    types: null,
  }));
  if (idCible !== null) {
    const index = data.findIndex((t) => t.uuid === idCible);
    if (index >= 0) data[index] = { ...data[index]!, number: compteCible };
  }
  return { data, take: 100, skip: 0, totalRecords: n };
}

describe("fiche_tiers (D-T11-15)", () => {
  it("dossier GC + `code` ⇒ UNSUPPORTED_CAPABILITY avant réseau", async () => {
    const deps = depsDe([]);
    await expect(ficheTiers(deps, ctxGcDe(), { code: "CLI042" })).rejects.toMatchObject({
      erreur: { code: "UNSUPPORTED_CAPABILITY" },
    });
    expect(deps.transport.appels).toHaveLength(0);
  });

  it("CPT + `code` direct ⇒ 1 appel transport", async () => {
    const deps = depsDe([{ status: 200, corps: DETAIL_CPT }]);
    const resultat = await ficheTiers(deps, ctxDe(), { code: "4010001" });
    expect(resultat.appels_source).toBe(1);
    expect(deps.transport.appels).toHaveLength(1);
    expect((resultat.resultats[0] as { compte: string }).compte).toBe("4010001");
  });

  it("CPT + `code` inconnu ⇒ 404 ⇒ NOT_FOUND", async () => {
    const deps = depsDe([{ status: 404, corps: { message: "introuvable" } }]);
    await expect(ficheTiers(deps, ctxDe(), { code: "9999999" })).rejects.toMatchObject({
      erreur: { code: "NOT_FOUND" },
    });
  });

  it("CPT + `id` résolu (1 correspondance) puis fiche détail (2 appels)", async () => {
    const deps = depsDe([{ status: 200, corps: pageTiers(5, "u-2", "4010003") }, { status: 200, corps: DETAIL_CPT }]);
    const resultat = await ficheTiers(deps, ctxDe(), { id: "u-2" });
    expect(deps.transport.appels).toHaveLength(2);
    expect(resultat.appels_source).toBe(2);
  });

  it("CPT + `id` ambigu (deux correspondances exactes) ⇒ AMBIGUOUS_REFERENCE", async () => {
    const page = pageTiers(5, "u-2");
    page.data[3] = { ...page.data[3]!, uuid: "u-2" };
    const deps = depsDe([{ status: 200, corps: page }]);
    await expect(ficheTiers(deps, ctxDe(), { id: "u-2" })).rejects.toMatchObject({
      erreur: { code: "AMBIGUOUS_REFERENCE" },
    });
  });

  it("CPT + `id` absent après scan complet ⇒ NOT_FOUND", async () => {
    const deps = depsDe([{ status: 200, corps: pageTiers(5, null) }]);
    await expect(ficheTiers(deps, ctxDe(), { id: "u-999" })).rejects.toMatchObject({
      erreur: { code: "NOT_FOUND" },
    });
  });

  it("CPT + `id` : scan interrompu par le budget ⇒ RESOLUTION_INCOMPLETE même avec un seul candidat", async () => {
    const deps = depsDe([{ status: 200, corps: pageTiers(100, null) }]);
    const ctx = ctxDe({ execution: { ...ctxDe().execution, budgetRestant: 1 } });
    await expect(ficheTiers(deps, ctx, { id: "u-999" })).rejects.toMatchObject({
      erreur: { code: "RESOLUTION_INCOMPLETE" },
    });
    expect(deps.transport.appels).toHaveLength(1);
  });

  it("GC + `id` ⇒ route `/customers/{id}`", async () => {
    const deps = depsDe([
      {
        status: 200,
        corps: {
          code: "CLI042",
          name: "Atelier Dupont",
          siret: null,
          intracommunityVatNumber: null,
          customerGroupId: "grp-1",
          settlementTermId: "cond-30j",
          balanceDue: "1287.50",
          pastDueBalance: "430.00",
        },
      },
    ]);
    const resultat = await ficheTiers(deps, ctxGcDe(), { id: "cli-042" });
    expect(deps.transport.appels[0]!.url).toContain("/customers/cli-042");
    expect(resultat.resultats[0]).toMatchObject({ code: "CLI042" });
  });
});
