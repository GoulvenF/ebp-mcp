import { describe, expect, it } from "vitest";
import { lireClient, lireClientParCode, trouverRoute } from "../../../dist/index.js";
import { budgetDe, contexteGescom, deps, fixtureParId } from "./fixtures.js";

describe("hubbix-gescom/clients.ts — critère #6 : /customers/{id} uniquement", () => {
  it("fiche par ID direct : balanceDue/pastDueBalance conservés en décimaux", async () => {
    const fixture = fixtureParId("gescom-customer-detail");
    const d = deps([{ status: fixture.reponse_ebp.statut_http, corps: fixture.reponse_ebp.corps }]);

    const client = await lireClient(d, budgetDe(), contexteGescom(), "cli-042");

    expect(client).toEqual(fixture.attentes.resultats[0]);
    expect(d.transport.appels).toHaveLength(1);
    expect(d.transport.appels[0]!.url).toContain("/customers/cli-042");
  });

  it("code client non supporté en GC ⇒ UNSUPPORTED_CAPABILITY avant tout réseau", async () => {
    const d = deps([]);

    expect(() => lireClientParCode("CLI042")).toThrowError(
      expect.objectContaining({ erreur: expect.objectContaining({ code: "UNSUPPORTED_CAPABILITY" }) }),
    );
    expect(d.transport.appels).toHaveLength(0);
  });

  it("absence de liste clients : aucune route `gc-customers` déclarée dans le registre", () => {
    expect(trouverRoute("gc-customers")).toBeUndefined();
    expect(trouverRoute("gc-customer-detail")).toBeDefined();
  });

  it("forme inattendue (tableau au lieu d'une fiche) ⇒ UPSTREAM_SCHEMA_CHANGED", async () => {
    const d = deps([{ status: 200, corps: [] }]);

    await expect(lireClient(d, budgetDe(), contexteGescom(), "cli-x")).rejects.toMatchObject({
      erreur: { code: "UPSTREAM_SCHEMA_CHANGED" },
    });
  });
});
