import { describe, expect, it } from "vitest";
import { listerTauxTva } from "../../../dist/index.js";
import { budgetDe, contexteGescom, deps, fixtureParId } from "./fixtures.js";

describe("hubbix-gescom/tva.ts — critère #5 : /vat-rates tableau nu", () => {
  it("tableau nu lu correctement, territorialité normalisée", async () => {
    const fixture = fixtureParId("gescom-vat-rates-tableau-nu");
    const d = deps([{ status: fixture.reponse_ebp.statut_http, corps: fixture.reponse_ebp.corps }]);

    const { resultats, avertissements } = await listerTauxTva(d, budgetDe(), contexteGescom());

    expect(resultats).toEqual(fixture.attentes.resultats);
    expect(avertissements).toEqual(fixture.attentes.avertissements);
    expect(d.transport.appels).toHaveLength(1);
    expect(d.transport.appels[0]!.url).toContain("/hubbix-gctpe/api/public/v1/vat-rates");
  });

  it("territorialité hors énumération ⇒ `inconnu` + avertissement citant la valeur source", async () => {
    const d = deps([
      {
        status: 200,
        corps: [{ label: "Taux mystère", rate: "12.5", territoriality: 9, isDefault: false }],
      },
    ]);

    const { resultats, avertissements } = await listerTauxTva(d, budgetDe(), contexteGescom());

    expect(resultats).toEqual([{ libelle: "Taux mystère", taux: "12.5", territorialite: "inconnu", defaut: false }]);
    expect(avertissements).toHaveLength(1);
    expect(avertissements[0]).toContain("9");
  });

  it("forme inattendue (objet au lieu d'un tableau nu) ⇒ UPSTREAM_SCHEMA_CHANGED", async () => {
    const d = deps([{ status: 200, corps: { elements: [], take: 50, skip: 0, total: 0 } }]);

    await expect(listerTauxTva(d, budgetDe(), contexteGescom())).rejects.toMatchObject({
      erreur: { code: "UPSTREAM_SCHEMA_CHANGED" },
    });
  });
});
