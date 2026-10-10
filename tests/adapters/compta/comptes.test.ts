import { describe, expect, it } from "vitest";
import { lireCompteGeneral, listerComptesGeneraux } from "../../../dist/index.js";
import { budgetDe, contexteCompta, deps, fixtureParId } from "./fixtures.js";

describe("compta/comptes.ts — /general-account", () => {
  it("liste `{data:[...]}` sans totalRecords ⇒ total_source null, jamais inventé", async () => {
    const fixture = fixtureParId("compta-general-account-liste");
    const d = deps([{ status: fixture.reponse_ebp.statut_http, corps: fixture.reponse_ebp.corps }]);

    const page = await listerComptesGeneraux(d, budgetDe(), contexteCompta());

    expect(page.resultats).toEqual(fixture.attentes.resultats);
    expect(page.renvoyes).toBe(fixture.attentes.pagination!.renvoyes);
    expect(page.total_source).toBeNull();
    expect(d.transport.appels[0]!.url).toContain("/hubbix-cpttpe/api/v1/general-account");
    expect(d.transport.appels[0]!.url).not.toContain("sortField");
  });

  it("n'envoie que les paramètres documentés (D-T09-4), jamais de tri", async () => {
    const d = deps([{ status: 200, corps: { data: [] } }]);

    await listerComptesGeneraux(d, budgetDe(), contexteCompta(), { search: "411", isActive: true });

    const url = d.transport.appels[0]!.url;
    expect(url).toContain("search=411");
    expect(url).toContain("isActive=true");
    expect(url).not.toContain("sort");
  });

  it("fiche `/general-account/{numero}` : champ non garanti par la source laissé `null`", async () => {
    const fixture = fixtureParId("compta-general-account-detail");
    const d = deps([{ status: fixture.reponse_ebp.statut_http, corps: fixture.reponse_ebp.corps }]);

    const { resultat } = await lireCompteGeneral(d, budgetDe(), contexteCompta(), "706000");

    expect(resultat).toEqual(fixture.attentes.resultats[0]);
    expect(d.transport.appels[0]!.url).toContain("/general-account/706000");
  });

  it("corps `{linesEntries:[...]}` sur /general-account ⇒ UPSTREAM_SCHEMA_CHANGED, jamais relu comme `data`", async () => {
    const d = deps([{ status: 200, corps: { linesEntries: [] } }]);
    await expect(listerComptesGeneraux(d, budgetDe(), contexteCompta())).rejects.toMatchObject({
      erreur: { code: "UPSTREAM_SCHEMA_CHANGED" },
    });
  });
});
