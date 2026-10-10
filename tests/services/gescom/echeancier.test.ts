import { describe, expect, it } from "vitest";
import { echeancierClients } from "../../../dist/index.js";
import { ctxComptaSurOutilGc, ctxGescom, depsService } from "./fixtures.js";

function echeance(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    date: "2026-02-10",
    customer: { id: "tiers-1", name: "Client Alpha", code: "CLI1" },
    document: { id: "doc-1", number: "F-1", documentType: "SaleInvoice", documentStatus: 0 },
    paymentMode: "Virement",
    amount: "100.00",
    remainingAmount: "100.00",
    ...overrides,
  };
}

function page(elements: unknown[]) {
  return { elements, take: 50, skip: 0, total: elements.length };
}

describe("services/gescom/echeancier.ts — garde de famille (D-T11-1, A03)", () => {
  it("echeancier_clients sur dossier CPT ⇒ UNSUPPORTED_CAPABILITY, 0 appel transport", async () => {
    const d = depsService([]);
    await expect(echeancierClients(d, ctxComptaSurOutilGc(), {})).rejects.toMatchObject({
      erreur: { code: "UNSUPPORTED_CAPABILITY" },
    });
    expect(d.transport.appels).toHaveLength(0);
  });
});

describe("services/gescom/echeancier.ts — en_retard/jours_retard (D-T11-9)", () => {
  it("échéance = aujourd'hui ⇒ en_retard: false, jours_retard: 0", async () => {
    const d = depsService([{ status: 200, corps: page([echeance("e1", { date: "2026-02-10" })]) }]);
    d.clock.definir(new Date("2026-02-10T10:00:00.000Z"));
    const resultat = await echeancierClients(d, ctxGescom(), {});
    expect(resultat.resultats[0]).toMatchObject({ en_retard: false, jours_retard: 0 });
  });

  it("échéance = veille ⇒ en_retard: true, jours_retard: 1", async () => {
    const d = depsService([{ status: 200, corps: page([echeance("e1", { date: "2026-02-09" })]) }]);
    d.clock.definir(new Date("2026-02-10T10:00:00.000Z"));
    const resultat = await echeancierClients(d, ctxGescom(), {});
    expect(resultat.resultats[0]).toMatchObject({ en_retard: true, jours_retard: 1 });
  });

  it("reste dû à 0, échéance passée ⇒ en_retard: false (rien n'est dû)", async () => {
    const d = depsService([
      { status: 200, corps: page([echeance("e1", { date: "2026-02-01", remainingAmount: "0.00" })]) },
    ]);
    d.clock.definir(new Date("2026-02-10T10:00:00.000Z"));
    const resultat = await echeancierClients(d, ctxGescom(), {});
    expect(resultat.resultats[0]).toMatchObject({ en_retard: false });
  });

  it("date d'échéance absente ⇒ en_retard/jours_retard à null, avec avertissement", async () => {
    const d = depsService([{ status: 200, corps: page([echeance("e1", { date: null })]) }]);
    d.clock.definir(new Date("2026-02-10T10:00:00.000Z"));
    const resultat = await echeancierClients(d, ctxGescom(), {});
    expect(resultat.resultats[0]).toMatchObject({ en_retard: null, jours_retard: null });
    expect(resultat.avertissements.some((a) => a.includes("sans date"))).toBe(true);
  });

  it("horloge à 23h30 UTC le 31/12 ⇒ aujourd'hui = 01/01 (Europe/Paris)", async () => {
    const d = depsService([{ status: 200, corps: page([echeance("e1", { date: "2027-01-01" })]) }]);
    d.clock.definir(new Date("2026-12-31T23:30:00.000Z"));
    const resultat = await echeancierClients(d, ctxGescom(), {});
    // Échéance au 01/01, "aujourd'hui" déjà 01/01 à Paris ⇒ jours_retard: 0 (pas 1, ni -1).
    expect(resultat.resultats[0]).toMatchObject({ jours_retard: 0, en_retard: false });
  });
});

describe("services/gescom/echeancier.ts — filtre `tiers` exact sur `tiers_id`", () => {
  it("ne conserve que l'échéance dont `tiers_id` correspond exactement", async () => {
    const d = depsService([
      {
        status: 200,
        corps: page([
          echeance("e1", { customer: { id: "tiers-1", name: "A", code: "A" } }),
          echeance("e2", { customer: { id: "tiers-2", name: "A", code: "A" } }),
        ]),
      },
    ]);
    const resultat = await echeancierClients(d, ctxGescom(), { tiers: "tiers-1" });
    expect(resultat.resultats.map((e) => e.id)).toEqual(["e1"]);
  });
});
