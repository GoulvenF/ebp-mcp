import { describe, expect, it } from "vitest";
import { rechercherTiers } from "../../../dist/index.js";
import { ctxDe, ctxGcDe, depsDe } from "./fixtures.js";

const PAGE_TIERS = {
  data: [
    { uuid: "u-1", name: "Café Dupont", number: "4010001", vatNumber: null, siret: null, isActive: true, types: null },
    { uuid: "u-2", name: "Boulangerie Martin", number: "4010002", vatNumber: null, siret: null, isActive: false, types: null },
  ],
  take: 50,
  skip: 0,
  totalRecords: 2,
};

describe("rechercher_tiers (D-T11-5/D-T11-6)", () => {
  it("dossier GC ⇒ UNSUPPORTED_CAPABILITY, 0 appel transport", async () => {
    const deps = depsDe([]);
    await expect(rechercherTiers(deps, ctxGcDe(), {})).rejects.toMatchObject({
      erreur: { code: "UNSUPPORTED_CAPABILITY" },
    });
    expect(deps.transport.appels).toHaveLength(0);
  });

  it("`type` fourni ⇒ refus avant réseau (D-T11-6, valeurs non prouvées)", async () => {
    const deps = depsDe([]);
    await expect(rechercherTiers(deps, ctxDe(), { type: "client" })).rejects.toMatchObject({
      erreur: { code: "UNSUPPORTED_CAPABILITY" },
    });
    expect(deps.transport.appels).toHaveLength(0);
  });

  it("`texte` filtre localement en NFC/casse-insensible sur nom/compte", async () => {
    const deps = depsDe([{ status: 200, corps: PAGE_TIERS }]);
    const resultat = await rechercherTiers(deps, ctxDe(), { texte: "CAFÉ" });
    expect(resultat.resultats).toHaveLength(1);
    expect(resultat.resultats[0]!.compte).toBe("4010001");
  });

  it("`actif` filtre localement par égalité stricte", async () => {
    const deps = depsDe([{ status: 200, corps: PAGE_TIERS }]);
    const resultat = await rechercherTiers(deps, ctxDe(), { actif: false });
    expect(resultat.resultats).toHaveLength(1);
    expect(resultat.resultats[0]!.compte).toBe("4010002");
  });

  it("n'envoie jamais `search`/`category`/tri, seulement skip/take", async () => {
    const deps = depsDe([{ status: 200, corps: PAGE_TIERS }]);
    await rechercherTiers(deps, ctxDe(), { limite: 50 });
    expect(deps.transport.appels).toHaveLength(1);
    const url = deps.transport.appels[0]!.url;
    expect(url).not.toContain("search");
    expect(url).not.toContain("category");
    expect(url).not.toContain("sort");
    expect(url).toContain("skip");
    expect(url).toContain("take");
  });

  it("liste paginée : `inclure_brut: true` ⇒ bruts aligné 1:1 sur resultats rendus", async () => {
    const deps = depsDe([{ status: 200, corps: PAGE_TIERS }]);
    const resultat = await rechercherTiers(deps, ctxDe(), { inclure_brut: true });
    expect(resultat.bruts).not.toBeNull();
    expect(resultat.bruts).toHaveLength(resultat.resultats.length);
  });

  it("`inclure_brut: false` (défaut) ⇒ bruts null", async () => {
    const deps = depsDe([{ status: 200, corps: PAGE_TIERS }]);
    const resultat = await rechercherTiers(deps, ctxDe(), {});
    expect(resultat.bruts).toBeNull();
  });
});
