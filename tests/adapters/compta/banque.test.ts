import { describe, expect, it } from "vitest";
import { listerTransactionsBancaires } from "../../../dist/index.js";
import { budgetDe, contexteCompta, deps, fixtureParId } from "./fixtures.js";

describe("compta/banque.ts — /bank-transactions", () => {
  it("conforme à la fixture : `debit` null côté crédit conservé, `statut` inconnu avec `statut_source`", async () => {
    const fixture = fixtureParId("compta-bank-transactions");
    const parametres = fixture.requete_attendue.parametres as Record<string, unknown>;
    const d = deps([{ status: fixture.reponse_ebp.statut_http, corps: fixture.reponse_ebp.corps }]);

    const page = await listerTransactionsBancaires(d, budgetDe(), contexteCompta(), {
      skip: parametres.skip as number,
      take: parametres.take as number,
      startDate: parametres.startDate as string,
      endDate: parametres.endDate as string,
    });

    expect(page.resultats).toEqual(fixture.attentes.resultats);
    expect(page.resultats[0]!.debit).toBeNull();
    expect(page.resultats[0]!.credit).not.toBeNull();
    expect(page.resultats[0]!.statut).toBe("inconnu");
    expect(page.resultats[0]!.statut_source).toBe("1");
  });

  it("n'envoie jamais `status` ni `bankAccount(s)`, capacité non supportée refusée avant réseau", async () => {
    const d = deps([]);
    await expect(
      listerTransactionsBancaires(d, budgetDe(), contexteCompta(), { skip: 0, take: 50, statut: "rapproche" }),
    ).rejects.toMatchObject({ erreur: { code: "UNSUPPORTED_CAPABILITY" } });
    expect(d.transport.appels).toHaveLength(0);
  });

  it("n'envoie jamais de tri même si le registre T07 l'autorise", async () => {
    const d = deps([{ status: 200, corps: { data: [] } }]);
    await listerTransactionsBancaires(d, budgetDe(), contexteCompta(), { skip: 0, take: 50 });
    expect(d.transport.appels[0]!.url).not.toContain("sort");
  });

  it("`take` hors de [1,100] : refusé avant tout réseau", async () => {
    const d = deps([]);
    await expect(
      listerTransactionsBancaires(d, budgetDe(), contexteCompta(), { skip: 0, take: 200 }),
    ).rejects.toMatchObject({ erreur: { code: "INVALID_ARGUMENT" } });
    expect(d.transport.appels).toHaveLength(0);
  });

  it("côté débit null distinct de côté crédit null : un côté inutilisé reste null, pas 0", async () => {
    const d = deps([
      {
        status: 200,
        corps: {
          data: [
            {
              label: "Prélèvement",
              account: { bankName: "Banque Démo", iban: null, balance: null },
              operationDate: "2026-03-05",
              valueDate: "2026-03-05",
              debit: "120.00",
              credit: null,
              reference: "PRLV-01",
              status: 0,
            },
          ],
        },
      },
    ]);

    const page = await listerTransactionsBancaires(d, budgetDe(), contexteCompta(), { skip: 0, take: 50 });

    expect(page.resultats[0]!.debit).toBe("120");
    expect(page.resultats[0]!.credit).toBeNull();
  });
});
