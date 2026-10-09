import { describe, expect, it } from "vitest";
import { listerReglements } from "../../../dist/index.js";
import { budgetDe, contexteGescom, deps, fixtureParId } from "./fixtures.js";

describe("hubbix-gescom/reglements.ts — critère #8 : /settlements, A14, settlementType", () => {
  it("tiers_id toujours null, settlementType connu normalisé, valeur inconnue signalée sans la requalifier", async () => {
    const fixture = fixtureParId("gescom-settlements-liste");
    const parametres = fixture.requete_attendue.parametres as { skip: number; take: number };
    const d = deps([{ status: fixture.reponse_ebp.statut_http, corps: fixture.reponse_ebp.corps }]);

    const page = await listerReglements(d, budgetDe(), contexteGescom(), parametres);

    expect(page.resultats).toEqual(fixture.attentes.resultats);
    expect(page.avertissements).toEqual(fixture.attentes.avertissements);
    expect(page.resultats.every((r) => r.tiers_id === null)).toBe(true);
  });

  it("filtre par ID tiers refusé avant tout réseau (A14, la source ne fournit pas d'ID client)", async () => {
    const d = deps([]);
    await expect(
      listerReglements(d, budgetDe(), contexteGescom(), { skip: 0, take: 50, tiers: "cli-1" }),
    ).rejects.toMatchObject({ erreur: { code: "UNSUPPORTED_CAPABILITY" } });
    expect(d.transport.appels).toHaveLength(0);
  });
});
