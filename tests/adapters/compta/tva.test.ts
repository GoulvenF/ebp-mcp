import { describe, expect, it } from "vitest";
import { listerTauxTvaCpt } from "../../../dist/index.js";
import { budgetDe, contexteCompta, deps, fixtureParId } from "./fixtures.js";

describe("compta/tva.ts — /vat-rate", () => {
  it("conforme à la fixture : territorialité conservée en chaîne opaque", async () => {
    const fixture = fixtureParId("compta-vat-rate");
    const d = deps([{ status: fixture.reponse_ebp.statut_http, corps: fixture.reponse_ebp.corps }]);

    const { resultats, avertissements } = await listerTauxTvaCpt(d, budgetDe(), contexteCompta());

    expect(resultats).toEqual(fixture.attentes.resultats);
    expect(avertissements).toEqual(fixture.attentes.avertissements);
    expect(d.transport.appels[0]!.url).toContain("/vat-rate");
  });

  it("taux en nombre JSON non ambigu accepté, converti sans `Number`/`parseFloat`", async () => {
    const d = deps([{ status: 200, corps: { data: [{ designation: "TVA réduite", rate: 5.5, isActive: true, territoriality: 2 }] } }]);

    const { resultats } = await listerTauxTvaCpt(d, budgetDe(), contexteCompta());

    expect(resultats[0]!.taux).toBe("5.5");
    expect(resultats[0]!.territorialite).toBe("2");
  });
});
