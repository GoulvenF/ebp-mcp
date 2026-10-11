import { describe, expect, it } from "vitest";
import { journauxRessource } from "../../../dist/index.js";
import { corpsJournaux, ctxDe, ctxGcDe, depsDe } from "./fixtures.js";

describe("journauxRessource (D-T12-13)", () => {
  it("source de 250 éléments ⇒ 100 rendus, hasMore: true, curseur: null, avertissement de troncature", async () => {
    const deps = depsDe([{ status: 200, corps: corpsJournaux(250) }]);
    const resultat = await journauxRessource(deps, ctxDe(), {});

    expect(resultat.resultats).toHaveLength(100);
    expect(resultat.pagination?.hasMore).toBe(true);
    expect(resultat.pagination?.curseur).toBeNull();
    expect(resultat.avertissements).toContain("ressource limitée aux 100 premiers éléments ; aucune continuation en v0.1");
    expect(resultat.bruts).toBeNull();
  });

  it("source de 30 éléments ⇒ complète, pas d'avertissement de troncature", async () => {
    const deps = depsDe([{ status: 200, corps: corpsJournaux(30) }]);
    const resultat = await journauxRessource(deps, ctxDe(), {});

    expect(resultat.resultats).toHaveLength(30);
    expect(resultat.pagination?.hasMore).toBe(false);
    expect(resultat.pagination?.curseur).toBeNull();
    expect(resultat.completude).toBe("complete");
    expect(resultat.avertissements).not.toContain("ressource limitée aux 100 premiers éléments ; aucune continuation en v0.1");
  });

  it("dossier GC ⇒ UNSUPPORTED_CAPABILITY, 0 appel transport", async () => {
    const deps = depsDe([]);
    await expect(journauxRessource(deps, ctxGcDe(), {})).rejects.toMatchObject({
      erreur: { code: "UNSUPPORTED_CAPABILITY" },
    });
    expect(deps.transport.appels).toHaveLength(0);
  });

  it("entrée avec clé inconnue ⇒ INVALID_ARGUMENT, 0 appel transport", async () => {
    const deps = depsDe([]);
    await expect(journauxRessource(deps, ctxDe(), { inattendu: true })).rejects.toMatchObject({
      erreur: { code: "INVALID_ARGUMENT" },
    });
    expect(deps.transport.appels).toHaveLength(0);
  });

  it("deuxième lecture servie par le cache : 0 appel transport supplémentaire", async () => {
    const deps = depsDe([{ status: 200, corps: corpsJournaux(30) }]);
    const ctx = ctxDe();

    const premier = await journauxRessource(deps, ctx, {});
    expect(deps.transport.appels).toHaveLength(1);

    const second = await journauxRessource(deps, ctx, {});
    expect(deps.transport.appels).toHaveLength(1);
    expect(second.resultats).toEqual(premier.resultats);
  });

  it("budget partagé respecté : une lecture réussie consomme exactement une tentative", async () => {
    const deps = depsDe([{ status: 200, corps: corpsJournaux(10) }]);
    const resultat = await journauxRessource(deps, ctxDe(), {});
    expect(resultat.tentatives).toBe(1);
    expect(resultat.appels_source).toBe(1);
  });
});
