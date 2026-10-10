import { describe, expect, it } from "vitest";
import { lireEcriture, listerLignesEcriture, rechercherLignesParUuid } from "../../../dist/index.js";
import { budgetDe, contexteCompta, deps, fixtureParId } from "./fixtures.js";

describe("compta/ecritures.ts — /lines-entries", () => {
  it("wrapper `linesEntries` distinct de `data` : conforme à la fixture, ecriture_id null, journal/date/mode issus de entry{…}", async () => {
    const fixture = fixtureParId("compta-lines-entries");
    const parametres = fixture.requete_attendue.parametres as Record<string, unknown>;
    const d = deps([{ status: fixture.reponse_ebp.statut_http, corps: fixture.reponse_ebp.corps }]);

    const page = await listerLignesEcriture(d, budgetDe(), contexteCompta(), {
      skip: parametres.skip as number,
      take: parametres.take as number,
      startDate: parametres.startDate as string,
      endDate: parametres.endDate as string,
    });

    expect(page.resultats).toEqual(fixture.attentes.resultats);
    expect(page.resultats[0]!.ecriture_id).toBeNull();
    expect(page.resultats[0]!.id).not.toBe(page.resultats[0]!.ecriture_id);
    expect(page.total_source).toBeNull();
    expect(page.avertissements).toEqual(fixture.attentes.avertissements);
    expect(d.transport.appels[0]!.url).toContain("/lines-entries");
  });

  it("n'envoie jamais `journals` (CSV), `nature` ni de paramètre de tri", async () => {
    const d = deps([{ status: 200, corps: { linesEntries: [] } }]);
    await listerLignesEcriture(d, budgetDe(), contexteCompta(), { skip: 0, take: 50 });
    const url = d.transport.appels[0]!.url;
    expect(url).not.toContain("journals=");
    expect(url).not.toContain("nature");
    expect(url).not.toContain("sort");
  });

  it("`nature` demandée ⇒ UNSUPPORTED_CAPABILITY avant tout réseau", async () => {
    const d = deps([]);
    await expect(
      listerLignesEcriture(d, budgetDe(), contexteCompta(), { skip: 0, take: 50, nature: "achat" }),
    ).rejects.toMatchObject({ erreur: { code: "UNSUPPORTED_CAPABILITY" } });
    expect(d.transport.appels).toHaveLength(0);
  });

  it("tri explicite demandé ⇒ UNSUPPORTED_CAPABILITY avant tout réseau", async () => {
    const d = deps([]);
    await expect(
      listerLignesEcriture(d, budgetDe(), contexteCompta(), { skip: 0, take: 50, tri: "date" }),
    ).rejects.toMatchObject({ erreur: { code: "UNSUPPORTED_CAPABILITY" } });
    expect(d.transport.appels).toHaveLength(0);
  });

  it("`take` hors de [1,100] : refusé avant tout réseau", async () => {
    const d = deps([]);
    await expect(listerLignesEcriture(d, budgetDe(), contexteCompta(), { skip: 0, take: 101 })).rejects.toMatchObject({
      erreur: { code: "INVALID_ARGUMENT" },
    });
    expect(d.transport.appels).toHaveLength(0);
  });

  it("corps `{data:[...]}` ⇒ UPSTREAM_SCHEMA_CHANGED, jamais lu comme `linesEntries`", async () => {
    const d = deps([{ status: 200, corps: { data: [], totalRecords: 0 } }]);
    await expect(listerLignesEcriture(d, budgetDe(), contexteCompta(), { skip: 0, take: 50 })).rejects.toMatchObject({
      erreur: { code: "UPSTREAM_SCHEMA_CHANGED" },
    });
  });

  it("deux lignes au contenu source strictement identique ⇒ `id` distincts (rang 1 puis 2)", async () => {
    const ligne = {
      entry: { journal: "VE", date: "2026-03-05", entryMode: "Validé" },
      generalAccount: "411000",
      auxiliaryAccount: null,
      label: "Vente mars",
      debit: "100.00",
      credit: null,
      piece: "FA2026-010",
      document: null,
      deadline: "2026-04-05",
      lettering: "A",
    };
    const d = deps([{ status: 200, corps: { linesEntries: [ligne, ligne] } }]);

    const page = await listerLignesEcriture(d, budgetDe(), contexteCompta(), { skip: 0, take: 50 });

    expect(page.resultats).toHaveLength(2);
    expect(page.resultats[0]!.id).not.toBe(page.resultats[1]!.id);
    expect(page.resultats[0]!.id.endsWith("-1")).toBe(true);
    expect(page.resultats[1]!.id.endsWith("-2")).toBe(true);
  });

  it("`entryMode` inconnu ⇒ `mode: \"inconnu\"` + avertissement citant la valeur source", async () => {
    const d = deps([
      {
        status: 200,
        corps: {
          linesEntries: [
            {
              entry: { journal: "VE", date: "2026-03-05", entryMode: "Brouillon" },
              generalAccount: "411000",
              auxiliaryAccount: null,
              label: "Vente mars",
              debit: null,
              credit: null,
              piece: null,
              document: null,
              deadline: null,
              lettering: null,
            },
          ],
        },
      },
    ]);

    const page = await listerLignesEcriture(d, budgetDe(), contexteCompta(), { skip: 0, take: 50 });

    expect(page.resultats[0]!.mode).toBe("inconnu");
    expect(page.avertissements.some((a) => a.includes("Brouillon"))).toBe(true);
  });

  it("`debit`/`credit` `null` conservés, jamais convertis en `0`", async () => {
    const d = deps([
      {
        status: 200,
        corps: {
          linesEntries: [
            {
              entry: { journal: "BQ", date: "2026-03-01", entryMode: "Validé" },
              generalAccount: "512000",
              auxiliaryAccount: null,
              label: "Relevé",
              debit: null,
              credit: null,
              piece: null,
              document: null,
              deadline: null,
              lettering: null,
            },
          ],
        },
      },
    ]);

    const page = await listerLignesEcriture(d, budgetDe(), contexteCompta(), { skip: 0, take: 50 });

    expect(page.resultats[0]!.debit).toBeNull();
    expect(page.resultats[0]!.credit).toBeNull();
  });
});

describe("compta/ecritures.ts — /entries/{uuid}", () => {
  it("écriture complète conforme à la fixture : ecriture_id = UUID du segment, id de ligne distinct", async () => {
    const fixture = fixtureParId("compta-entry-detail");
    const uuid = "660e8400-e29b-41d4-a716-446655440020";
    const d = deps([{ status: fixture.reponse_ebp.statut_http, corps: fixture.reponse_ebp.corps }]);

    const { resultat, avertissements } = await lireEcriture(d, budgetDe(), contexteCompta(), uuid);

    expect(resultat).toEqual(fixture.attentes.resultats[0]);
    expect(resultat.lignes[0]!.ecriture_id).toBe(uuid);
    expect(resultat.lignes[0]!.id).not.toBe(uuid);
    expect(avertissements).toEqual(fixture.attentes.avertissements);
    expect(d.transport.appels[0]!.url).toContain(`/entries/${uuid}`);
  });

  it("tableau nu sur /entries/{uuid} ⇒ UPSTREAM_SCHEMA_CHANGED", async () => {
    const d = deps([{ status: 200, corps: [] }]);
    await expect(
      lireEcriture(d, budgetDe(), contexteCompta(), "660e8400-e29b-41d4-a716-446655440020"),
    ).rejects.toMatchObject({ erreur: { code: "UPSTREAM_SCHEMA_CHANGED" } });
  });
});

describe("compta/ecritures.ts — /search-entries/entries (tableau nu)", () => {
  it("conforme à la fixture : comptes courts et longs opaques, ecriture_id/journal/date/mode à null", async () => {
    const fixture = fixtureParId("compta-search-entries-tableau-nu");
    const d = deps([{ status: fixture.reponse_ebp.statut_http, corps: fixture.reponse_ebp.corps }]);

    const { resultats, avertissements } = await rechercherLignesParUuid(d, budgetDe(), contexteCompta(), [
      "550e8400-e29b-41d4-a716-446655440001",
    ]);

    expect(resultats).toEqual(fixture.attentes.resultats);
    expect(avertissements).toEqual(fixture.attentes.avertissements);
    expect(resultats[0]!.compte_general).toBe("0004100");
    expect(resultats[0]!.compte_tiers).toBe("411");
  });

  it("corps `{data:[...]}` sur /search-entries/entries ⇒ UPSTREAM_SCHEMA_CHANGED, jamais lu comme tableau nu", async () => {
    const d = deps([{ status: 200, corps: { data: [], totalRecords: 0 } }]);
    await expect(
      rechercherLignesParUuid(d, budgetDe(), contexteCompta(), ["550e8400-e29b-41d4-a716-446655440001"]),
    ).rejects.toMatchObject({ erreur: { code: "UPSTREAM_SCHEMA_CHANGED" } });
  });
});
