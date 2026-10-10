import { describe, expect, it } from "vitest";
import { lireJournal, listerJournaux } from "../../../dist/index.js";
import { budgetDe, contexteCompta, deps, fixtureParId } from "./fixtures.js";

describe("compta/journaux.ts — /journals", () => {
  it("liste conforme à la fixture : type normalisé, type_source conservé", async () => {
    const fixture = fixtureParId("compta-journals");
    const d = deps([{ status: fixture.reponse_ebp.statut_http, corps: fixture.reponse_ebp.corps }]);

    const page = await listerJournaux(d, budgetDe(), contexteCompta());

    expect(page.resultats).toEqual(fixture.attentes.resultats);
    expect(page.total_source).toBeNull();
    expect(page.avertissements).toEqual([]);
    expect(d.transport.appels[0]!.url).not.toContain("filter");
    expect(d.transport.appels[0]!.url).not.toContain("order");
  });

  it("`journalType.name` inconnu ⇒ `type: \"inconnu\"`, `type_source` conserve la valeur reçue, avertissement cite la valeur", async () => {
    const d = deps([
      {
        status: 200,
        corps: {
          data: [{ uuid: "jrn-9", code: "XX", name: "Divers", journalType: { name: "Mystère" }, counterpartAccount: null }],
        },
      },
    ]);

    const page = await listerJournaux(d, budgetDe(), contexteCompta());

    expect(page.resultats[0]).toEqual({
      id: "jrn-9",
      code: "XX",
      nom: "Divers",
      type: "inconnu",
      type_source: "Mystère",
      compte_contrepartie: null,
    });
    expect(page.avertissements).toHaveLength(1);
    expect(page.avertissements[0]).toContain("Mystère");
  });

  it("fiche `/journals/{code}` conforme à la fixture", async () => {
    const d = deps([
      {
        status: 200,
        corps: { uuid: "jrn-1", code: "VE", name: "Ventes", journalType: { name: "Ventes" }, counterpartAccount: "411000" },
      },
    ]);

    const { resultat } = await lireJournal(d, budgetDe(), contexteCompta(), "VE");

    expect(resultat).toEqual({
      id: "jrn-1",
      code: "VE",
      nom: "Ventes",
      type: "ventes",
      type_source: "Ventes",
      compte_contrepartie: "411000",
    });
    expect(d.transport.appels[0]!.url).toContain("/journals/VE");
  });

  it("tableau nu sur /journals ⇒ UPSTREAM_SCHEMA_CHANGED, jamais relu comme `data`", async () => {
    const d = deps([{ status: 200, corps: [] }]);
    await expect(listerJournaux(d, budgetDe(), contexteCompta())).rejects.toMatchObject({
      erreur: { code: "UPSTREAM_SCHEMA_CHANGED" },
    });
  });
});
