import { describe, expect, it } from "vitest";
import { listerEcheances } from "../../../dist/index.js";
import { budgetDe, contexteGescom, deps, fixtureParId } from "./fixtures.js";

describe("hubbix-gescom/echeances.ts — critère #6 : /sale-commitments, reste_du échéance distinct du document", () => {
  it("fenêtre d'un jour : échéance normalisée, `document_type`/`document_statut` opaques (chaînes brutes)", async () => {
    const fixture = fixtureParId("gescom-sale-commitments-fenetre-un-jour");
    const parametres = fixture.requete_attendue.parametres as { skip: number; take: number };
    const d = deps([{ status: fixture.reponse_ebp.statut_http, corps: fixture.reponse_ebp.corps }]);

    const page = await listerEcheances(d, budgetDe(), contexteGescom(), parametres);

    expect(page.resultats).toEqual(fixture.attentes.resultats);
    expect(page.resultats[0]!.document_statut).toBe("1");
  });

  it("`remainingAmount` de l'échéance distinct du `reste_du` du document dans un même document", async () => {
    const d = deps([
      {
        status: 200,
        corps: {
          elements: [
            {
              id: "ech-50",
              date: "2026-03-05",
              customer: { id: "cli-50", name: "Client Distinct", code: "CLI050" },
              document: { id: "doc-50", number: "F2026-050", documentType: "SaleInvoice", documentStatus: 1 },
              paymentMode: "Chèque",
              amount: "1000.00",
              remainingAmount: "250.00",
            },
          ],
          take: 50,
          skip: 0,
          total: 1,
        },
      },
    ]);

    const page = await listerEcheances(d, budgetDe(), contexteGescom(), { skip: 0, take: 50 });

    expect(page.resultats[0]!.reste_du).toBe("250");
    expect(page.resultats[0]!.montant).toBe("1000");
    expect(page.resultats[0]!.reste_du).not.toBe(page.resultats[0]!.montant);
  });
});
