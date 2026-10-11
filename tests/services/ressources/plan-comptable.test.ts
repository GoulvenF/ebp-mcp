import { describe, expect, it } from "vitest";
import { planComptableRessource } from "../../../dist/index.js";
import { corpsComptes, ctxDe, ctxGcDe, depsDe } from "./fixtures.js";

describe("planComptableRessource (D-T12-13)", () => {
  it("source de 250 éléments ⇒ 100 rendus, hasMore: true, curseur: null, avertissement de troncature", async () => {
    const deps = depsDe([{ status: 200, corps: corpsComptes(250) }]);
    const resultat = await planComptableRessource(deps, ctxDe(), {});

    expect(resultat.resultats).toHaveLength(100);
    expect(resultat.pagination?.hasMore).toBe(true);
    expect(resultat.pagination?.curseur).toBeNull();
    expect(resultat.avertissements).toContain("ressource limitée aux 100 premiers éléments ; aucune continuation en v0.1");
  });

  it("source de 30 éléments ⇒ complète", async () => {
    const deps = depsDe([{ status: 200, corps: corpsComptes(30) }]);
    const resultat = await planComptableRessource(deps, ctxDe(), {});

    expect(resultat.resultats).toHaveLength(30);
    expect(resultat.completude).toBe("complete");
    expect(resultat.pagination?.hasMore).toBe(false);
  });

  it("dossier GC ⇒ UNSUPPORTED_CAPABILITY, 0 appel transport", async () => {
    const deps = depsDe([]);
    await expect(planComptableRessource(deps, ctxGcDe(), {})).rejects.toMatchObject({
      erreur: { code: "UNSUPPORTED_CAPABILITY" },
    });
    expect(deps.transport.appels).toHaveLength(0);
  });

  it("deuxième lecture servie par le cache : 0 appel transport supplémentaire", async () => {
    const deps = depsDe([{ status: 200, corps: corpsComptes(30) }]);
    const ctx = ctxDe();

    await planComptableRessource(deps, ctx, {});
    expect(deps.transport.appels).toHaveLength(1);

    await planComptableRessource(deps, ctx, {});
    expect(deps.transport.appels).toHaveLength(1);
  });
});
