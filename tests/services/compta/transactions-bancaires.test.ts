import { describe, expect, it } from "vitest";
import { transactionsBancaires } from "../../../dist/index.js";
import { ctxDe, ctxGcDe, depsDe } from "./fixtures.js";

function transaction(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    label: "Virement reçu",
    account: { bankName: "Banque Démo", iban: "FR7630001007941234567890185", balance: null },
    operationDate: "2026-03-01",
    valueDate: "2026-03-02",
    debit: null,
    credit: "500.00",
    reference: "VIR-2026-001",
    status: 1,
    ...overrides,
  };
}

describe("transactions_bancaires (D-T11-5/D-T11-16)", () => {
  it("dossier GC ⇒ UNSUPPORTED_CAPABILITY, 0 appel transport", async () => {
    const deps = depsDe([]);
    await expect(
      transactionsBancaires(deps, ctxGcDe(), { du: "2026-03-01", au: "2026-03-31" }),
    ).rejects.toMatchObject({ erreur: { code: "UNSUPPORTED_CAPABILITY" } });
    expect(deps.transport.appels).toHaveLength(0);
  });

  it("`statut` fourni ⇒ refus avant réseau (D-T11-6, E07)", async () => {
    const deps = depsDe([]);
    await expect(
      transactionsBancaires(deps, ctxDe(), { du: "2026-03-01", au: "2026-03-31", statut: "rapproche" }),
    ).rejects.toMatchObject({ erreur: { code: "UNSUPPORTED_CAPABILITY" } });
    expect(deps.transport.appels).toHaveLength(0);
  });

  it("`compte` filtre localement par égalité EXACTE sur l'IBAN", async () => {
    const deps = depsDe([
      {
        status: 200,
        corps: {
          data: [
            transaction({ account: { bankName: "B1", iban: "FR7630001007941234567890185", balance: null } }),
            transaction({ account: { bankName: "B2", iban: "FR0000000000000000000000000", balance: null }, reference: "AUTRE" }),
          ],
          take: 50,
          skip: 0,
          totalRecords: 2,
        },
      },
    ]);
    const resultat = await transactionsBancaires(deps, ctxDe(), {
      du: "2026-03-01",
      au: "2026-03-31",
      compte: "FR7630001007941234567890185",
    });
    expect(resultat.resultats).toHaveLength(1);
    expect(resultat.resultats[0]!.reference).toBe("VIR-2026-001");
  });

  it("`debit`/`credit` `null` conservés (jamais convertis en 0)", async () => {
    const deps = depsDe([{ status: 200, corps: { data: [transaction()], take: 50, skip: 0, totalRecords: 1 } }]);
    const resultat = await transactionsBancaires(deps, ctxDe(), { du: "2026-03-01", au: "2026-03-31" });
    expect(resultat.resultats[0]!.debit).toBeNull();
    expect(resultat.resultats[0]!.credit).toBe("500");
  });

  it("date_operation `null` exclue avec avertissement", async () => {
    const deps = depsDe([
      { status: 200, corps: { data: [transaction({ operationDate: null })], take: 50, skip: 0, totalRecords: 1 } },
    ]);
    const resultat = await transactionsBancaires(deps, ctxDe(), { du: "2026-03-01", au: "2026-03-31" });
    expect(resultat.resultats).toHaveLength(0);
    expect(resultat.avertissements.some((a) => a.includes("date_operation absente"))).toBe(true);
  });
});
