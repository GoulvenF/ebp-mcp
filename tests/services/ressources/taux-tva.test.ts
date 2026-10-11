import { describe, expect, it } from "vitest";
import { tauxTvaRessource } from "../../../dist/index.js";
import { corpsTauxTvaCpt, corpsTauxTvaGc, ctxDe, ctxGcDe, depsDe } from "./fixtures.js";

describe("tauxTvaRessource (D-T12-13)", () => {
  it("dossier CPT ⇒ route vers /vat-rate (listerTauxTvaCpt)", async () => {
    const deps = depsDe([{ status: 200, corps: corpsTauxTvaCpt(5) }]);
    const resultat = await tauxTvaRessource(deps, ctxDe(), {});

    expect(resultat.resultats).toHaveLength(5);
    expect(deps.transport.appels).toHaveLength(1);
    expect(deps.transport.appels[0]?.url).toContain("/vat-rate");
    expect(deps.transport.appels[0]?.url).not.toContain("/vat-rates");
  });

  it("dossier GC ⇒ route vers /vat-rates (listerTauxTva)", async () => {
    const deps = depsDe([{ status: 200, corps: corpsTauxTvaGc(5) }]);
    const resultat = await tauxTvaRessource(deps, ctxGcDe(), {});

    expect(resultat.resultats).toHaveLength(5);
    expect(deps.transport.appels).toHaveLength(1);
    expect(deps.transport.appels[0]?.url).toContain("/vat-rates");
  });

  it("250 taux CPT ⇒ 100 rendus, hasMore: true, avertissement de troncature", async () => {
    const deps = depsDe([{ status: 200, corps: corpsTauxTvaCpt(250) }]);
    const resultat = await tauxTvaRessource(deps, ctxDe(), {});

    expect(resultat.resultats).toHaveLength(100);
    expect(resultat.pagination?.hasMore).toBe(true);
    expect(resultat.pagination?.curseur).toBeNull();
    expect(resultat.avertissements).toContain("ressource limitée aux 100 premiers éléments ; aucune continuation en v0.1");
  });

  it("deuxième lecture servie par le cache : 0 appel transport supplémentaire", async () => {
    const deps = depsDe([{ status: 200, corps: corpsTauxTvaCpt(5) }]);
    const ctx = ctxDe();

    await tauxTvaRessource(deps, ctx, {});
    expect(deps.transport.appels).toHaveLength(1);

    await tauxTvaRessource(deps, ctx, {});
    expect(deps.transport.appels).toHaveLength(1);
  });
});
