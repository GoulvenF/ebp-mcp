import { describe, expect, it } from "vitest";
import { lireInformationDomaine, lireParametresDossier } from "../../../dist/index.js";
import { budgetDe, contexteCompta, deps, fixtureParId } from "./fixtures.js";

describe("compta/domaine.ts — /domain-information", () => {
  it("fiche sans wrapper conforme à la fixture, en-tête tenantid (pas DomainId)", async () => {
    const fixture = fixtureParId("compta-domain-information");
    const d = deps([{ status: fixture.reponse_ebp.statut_http, corps: fixture.reponse_ebp.corps }]);

    const { resultat, avertissements } = await lireInformationDomaine(d, budgetDe(), contexteCompta());

    expect(resultat).toEqual(fixture.attentes.resultats[0]);
    expect(avertissements).toEqual(fixture.attentes.avertissements);
    expect(d.transport.appels).toHaveLength(1);
    expect(d.transport.appels[0]!.url).toContain("/hubbix-cpttpe/api/v1/domain-information");
    const headers = d.transport.appels[0]!.headers!;
    expect(headers["tenantid"]).toBe("dossier-cpt-test");
    expect(headers["DomainId"]).toBeUndefined();
  });

  it("corps tableau (forme inattendue) ⇒ UPSTREAM_SCHEMA_CHANGED", async () => {
    const d = deps([{ status: 200, corps: [] }]);
    await expect(lireInformationDomaine(d, budgetDe(), contexteCompta())).rejects.toMatchObject({
      erreur: { code: "UPSTREAM_SCHEMA_CHANGED" },
    });
  });
});

describe("compta/domaine.ts — /folder-settings", () => {
  it("exercices et mode de saisie conformes à la fixture", async () => {
    const fixture = fixtureParId("compta-folder-settings");
    const d = deps([{ status: fixture.reponse_ebp.statut_http, corps: fixture.reponse_ebp.corps }]);

    const { resultat, avertissements } = await lireParametresDossier(d, budgetDe(), contexteCompta());

    expect(resultat).toEqual(fixture.attentes.resultats[0]);
    expect(avertissements).toEqual(fixture.attentes.avertissements);
    expect(d.transport.appels[0]!.url).toContain("/folder-settings");
  });

  it("`entry.mode` inconnu ⇒ `inconnu` + avertissement citant la valeur source", async () => {
    const d = deps([
      {
        status: 200,
        corps: {
          exercices: [{ startDate: "2026-01-01", endDate: "2026-12-31", exerciceNumber: 1, closingDate: null }],
          entry: { mode: "Brouillon" },
        },
      },
    ]);

    const { resultat, avertissements } = await lireParametresDossier(d, budgetDe(), contexteCompta());

    expect(resultat.mode_saisie).toBe("inconnu");
    expect(avertissements).toHaveLength(1);
    expect(avertissements[0]).toContain("Brouillon");
  });

  it("`entry` absent ⇒ `mode_saisie: null`, aucun avertissement inventé", async () => {
    const d = deps([
      {
        status: 200,
        corps: {
          exercices: [{ startDate: "2026-01-01", endDate: "2026-12-31", exerciceNumber: 1, closingDate: null }],
        },
      },
    ]);

    const { resultat, avertissements } = await lireParametresDossier(d, budgetDe(), contexteCompta());

    expect(resultat.mode_saisie).toBeNull();
    expect(avertissements).toEqual([]);
  });
});
