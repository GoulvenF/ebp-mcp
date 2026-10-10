import { describe, expect, it } from "vitest";
import { lireTiers, listerTiers, listerTypesCompteAuxiliaire } from "../../../dist/index.js";
import { budgetDe, contexteCompta, deps, fixtureParId } from "./fixtures.js";

describe("compta/tiers.ts — /auxiliary-accounts", () => {
  it("liste `{data:[...],totalRecords}` conforme à la fixture (réutilise compta-tiers-liste-data)", async () => {
    const fixture = fixtureParId("compta-tiers-liste-data");
    const parametres = fixture.requete_attendue.parametres as { skip: number; take: number };
    const d = deps([{ status: fixture.reponse_ebp.statut_http, corps: fixture.reponse_ebp.corps }]);

    const page = await listerTiers(d, budgetDe(), contexteCompta(), { skip: parametres.skip, take: parametres.take });

    expect(page.resultats).toEqual(fixture.attentes.resultats);
    expect(page.total_source).toBe(fixture.attentes.pagination!.total_source);
    expect(d.transport.appels[0]!.url).toContain("/hubbix-cpttpe/api/v1/auxiliary-accounts");
  });

  it("compte conservé tel quel, zéros de tête préservés (A26)", async () => {
    const fixture = fixtureParId("compta-tiers-liste-data");
    const d = deps([{ status: fixture.reponse_ebp.statut_http, corps: fixture.reponse_ebp.corps }]);

    const page = await listerTiers(d, budgetDe(), contexteCompta(), { skip: 0, take: 50 });

    expect(page.resultats[0]!.compte).toBe("0004100");
  });

  it("`categorie` demandée ⇒ UNSUPPORTED_CAPABILITY avant tout appel réseau", async () => {
    const d = deps([]);
    await expect(
      listerTiers(d, budgetDe(), contexteCompta(), { skip: 0, take: 50, categorie: "client" }),
    ).rejects.toMatchObject({ erreur: { code: "UNSUPPORTED_CAPABILITY" } });
    expect(d.transport.appels).toHaveLength(0);
  });

  it("`take` hors de [1,100] : refusé avant tout réseau", async () => {
    const d = deps([]);
    await expect(listerTiers(d, budgetDe(), contexteCompta(), { skip: 0, take: 0 })).rejects.toMatchObject({
      erreur: { code: "INVALID_ARGUMENT" },
    });
    expect(d.transport.appels).toHaveLength(0);
  });

  it("`skip` négatif : refusé avant tout réseau", async () => {
    const d = deps([]);
    await expect(listerTiers(d, budgetDe(), contexteCompta(), { skip: -1, take: 50 })).rejects.toMatchObject({
      erreur: { code: "INVALID_ARGUMENT" },
    });
    expect(d.transport.appels).toHaveLength(0);
  });

  it("fiche `/auxiliary-accounts/{number}` : `contact.email` null conservé, jamais inventé", async () => {
    const fixture = fixtureParId("compta-auxiliary-account-detail");
    const d = deps([{ status: fixture.reponse_ebp.statut_http, corps: fixture.reponse_ebp.corps }]);

    const { resultat } = await lireTiers(d, budgetDe(), contexteCompta(), "4010001");

    expect(resultat).toEqual(fixture.attentes.resultats[0]);
    expect(d.transport.appels[0]!.url).toContain("/auxiliary-accounts/4010001");
  });
});

describe("compta/tiers.ts — /auxiliary-account-types", () => {
  it("code connu conservé, compte collectif source conservé (D-T09-6)", async () => {
    const fixture = fixtureParId("compta-auxiliary-account-types");
    const d = deps([{ status: fixture.reponse_ebp.statut_http, corps: fixture.reponse_ebp.corps }]);

    const { resultats, avertissements } = await listerTypesCompteAuxiliaire(d, budgetDe(), contexteCompta());

    expect(resultats).toEqual(fixture.attentes.resultats);
    expect(avertissements).toEqual([]);
  });

  it("code inconnu ⇒ `\"inconnu\"` + avertissement citant la valeur source, jamais déduit d'un préfixe de compte", async () => {
    const d = deps([{ status: 200, corps: { data: [{ code: "Z", collectiveAccount: "999" }] } }]);

    const { resultats, avertissements } = await listerTypesCompteAuxiliaire(d, budgetDe(), contexteCompta());

    expect(resultats).toEqual([{ code: "inconnu", code_source: "Z", compte_collectif: "999" }]);
    expect(avertissements).toHaveLength(1);
    expect(avertissements[0]).toContain("Z");
  });
});
