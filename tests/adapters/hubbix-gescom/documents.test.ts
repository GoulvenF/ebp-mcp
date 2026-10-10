import { describe, expect, it } from "vitest";
import { listerDocumentsVente } from "../../../dist/index.js";
import { budgetDe, contexteGescom, deps, fixtureParId } from "./fixtures.js";

describe("hubbix-gescom/documents.ts — critère #5 : /sale-documents, A14, reste_du document", () => {
  it("documentType hors énumération ⇒ `inconnu` + avertissement, documentStatus/accountingTransferStatus connus", async () => {
    const fixture = fixtureParId("gescom-sale-documents-enum-inconnu");
    const parametres = fixture.requete_attendue.parametres as { skip: number; take: number };
    const d = deps([{ status: fixture.reponse_ebp.statut_http, corps: fixture.reponse_ebp.corps }]);

    const page = await listerDocumentsVente(d, budgetDe(), contexteGescom(), parametres);

    expect(page.resultats).toEqual(fixture.attentes.resultats);
    expect(page.avertissements).toEqual(fixture.attentes.avertissements);
    expect(page.resultats[0]!.tiers_id).toBeNull();
  });

  it("avoir au montant source déjà négatif : conservé tel quel, `reste_du` du document", async () => {
    const fixture = fixtureParId("gescom-sale-documents-avoir-negatif");
    const parametres = fixture.requete_attendue.parametres as { skip: number; take: number };
    const d = deps([{ status: fixture.reponse_ebp.statut_http, corps: fixture.reponse_ebp.corps }]);

    const page = await listerDocumentsVente(d, budgetDe(), contexteGescom(), parametres);

    expect(page.resultats).toEqual(fixture.attentes.resultats);
    expect(page.resultats[0]!.reste_du).toBe("0");
  });

  it("`documentStatus` absent ⇒ `inconnu` + avertissement distinct d'une valeur hors énumération", async () => {
    const d = deps([
      {
        status: 200,
        corps: {
          elements: [
            {
              id: "doc-900",
              documentType: "SaleInvoice",
              name: "Client Sans Statut",
              date: "2026-03-01",
              number: "F2026-900",
              totalAmountVatExcluded: "10.00",
              totalAmountVatIncluded: "12.00",
              netAmountVatIncluded: "12.00",
              dueAmount: "12.00",
              accountingTransferStatus: 0,
            },
          ],
          take: 50,
          skip: 0,
          total: 1,
        },
      },
    ]);

    const page = await listerDocumentsVente(d, budgetDe(), contexteGescom(), { skip: 0, take: 50 });

    expect(page.resultats[0]!.statut).toBe("inconnu");
    expect(page.avertissements).toEqual(["Champ documentStatus absent de la source."]);
  });

  it("`documentStatus` présent mais hors énumération : avertissement cite la valeur numérique sans la requalifier", async () => {
    const d = deps([
      {
        status: 200,
        corps: {
          elements: [
            {
              id: "doc-901",
              documentType: "SaleInvoice",
              documentStatus: 9,
              name: "Client Statut Inconnu",
              date: "2026-03-02",
              number: "F2026-901",
              totalAmountVatExcluded: "10.00",
              totalAmountVatIncluded: "12.00",
              netAmountVatIncluded: "12.00",
              dueAmount: "12.00",
              accountingTransferStatus: 0,
            },
          ],
          take: 50,
          skip: 0,
          total: 1,
        },
      },
    ]);

    const page = await listerDocumentsVente(d, budgetDe(), contexteGescom(), { skip: 0, take: 50 });

    expect(page.resultats[0]!.statut).toBe("inconnu");
    expect(page.avertissements).toEqual(["Valeur enum inconnue reçue de la source pour documentStatus : 9"]);
  });

  it("`documentType` absent ⇒ `inconnu` + avertissement distinct d'une valeur hors énumération", async () => {
    const d = deps([
      {
        status: 200,
        corps: {
          elements: [
            {
              id: "doc-902",
              documentStatus: 0,
              name: "Client Sans Type",
              date: "2026-03-03",
              number: "F2026-902",
              totalAmountVatExcluded: "10.00",
              totalAmountVatIncluded: "12.00",
              netAmountVatIncluded: "12.00",
              dueAmount: "12.00",
              accountingTransferStatus: 0,
            },
          ],
          take: 50,
          skip: 0,
          total: 1,
        },
      },
    ]);

    const page = await listerDocumentsVente(d, budgetDe(), contexteGescom(), { skip: 0, take: 50 });

    expect(page.resultats[0]!.type).toBe("inconnu");
    expect(page.avertissements).toEqual(["Champ documentType absent de la source."]);
  });

  it("`documentType` présent mais non-chaîne : avertissement cite la valeur source sans la requalifier en `null`", async () => {
    const d = deps([
      {
        status: 200,
        corps: {
          elements: [
            {
              id: "doc-903",
              documentType: 42,
              documentStatus: 0,
              name: "Client Type Non-Chaîne",
              date: "2026-03-04",
              number: "F2026-903",
              totalAmountVatExcluded: "10.00",
              totalAmountVatIncluded: "12.00",
              netAmountVatIncluded: "12.00",
              dueAmount: "12.00",
              accountingTransferStatus: 0,
            },
          ],
          take: 50,
          skip: 0,
          total: 1,
        },
      },
    ]);

    const page = await listerDocumentsVente(d, budgetDe(), contexteGescom(), { skip: 0, take: 50 });

    expect(page.resultats[0]!.type).toBe("inconnu");
    expect(page.avertissements).toEqual(["Valeur enum inconnue reçue de la source pour documentType : 42"]);
  });
});
