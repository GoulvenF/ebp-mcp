import { describe, expect, it } from "vitest";
import { lireDetailDocumentVente, resoudreRouteDetail } from "../../../dist/index.js";
import { budgetDe, contexteGescom, deps, fixtureParId } from "./fixtures.js";

interface CasRoutage {
  readonly fixtureId: string;
  readonly documentType: string;
  readonly documentStatus: number;
  readonly cheminAttendu: string;
}

const CAS: readonly CasRoutage[] = [
  { fixtureId: "gescom-sale-invoice-detail-provisoire", documentType: "SaleInvoice", documentStatus: 0, cheminAttendu: "/sale-invoices/doc-200" },
  { fixtureId: "gescom-sale-invoice-detail-validee", documentType: "SaleInvoice", documentStatus: 1, cheminAttendu: "/sale-invoices/validated/doc-201" },
  { fixtureId: "gescom-sale-credit-detail-provisoire", documentType: "SaleCredit", documentStatus: 0, cheminAttendu: "/sale-credits/doc-202" },
  { fixtureId: "gescom-sale-credit-detail-validee", documentType: "SaleCredit", documentStatus: 1, cheminAttendu: "/sale-credits/validated/doc-203" },
  { fixtureId: "gescom-sale-quote-detail-provisoire", documentType: "SaleQuote", documentStatus: 0, cheminAttendu: "/sale-quotes/doc-204" },
  { fixtureId: "gescom-sale-quote-detail-facturee", documentType: "SaleQuote", documentStatus: 1, cheminAttendu: "/sale-quotes/invoiced/doc-205" },
  { fixtureId: "gescom-sale-deposit-invoice-detail", documentType: "SaleDepositInvoice", documentStatus: 0, cheminAttendu: "/sale-deposit-invoices/doc-206" },
  { fixtureId: "gescom-sale-deposit-credit-detail", documentType: "SaleDepositCredit", documentStatus: 0, cheminAttendu: "/sale-deposit-credits/doc-207" },
];

describe("hubbix-gescom/documents-detail.ts — critère #1/#2 : chaque couple type/statut atteint sa route", () => {
  for (const cas of CAS) {
    it(`${cas.documentType} / ${cas.documentStatus} → ${cas.cheminAttendu}`, async () => {
      const fixture = fixtureParId(cas.fixtureId);
      const id = (fixture.reponse_ebp.corps as { id: string }).id;
      const d = deps([{ status: fixture.reponse_ebp.statut_http, corps: fixture.reponse_ebp.corps }]);

      const { resultat, avertissements } = await lireDetailDocumentVente(
        d,
        budgetDe(),
        contexteGescom(),
        cas.documentType,
        cas.documentStatus,
        id,
      );

      expect(resultat).toEqual(fixture.attentes.resultats[0]);
      expect(avertissements).toEqual(fixture.attentes.avertissements);
      expect(d.transport.appels).toHaveLength(1);
      expect(d.transport.appels[0]!.url).toContain(cas.cheminAttendu);
    });
  }

  it("deuxième échéance de commitments[] à `remainingAmount` partiel, distinct de `amount` d'origine", async () => {
    const fixture = fixtureParId("gescom-sale-invoice-detail-provisoire");
    const d = deps([{ status: fixture.reponse_ebp.statut_http, corps: fixture.reponse_ebp.corps }]);

    const { resultat } = await lireDetailDocumentVente(d, budgetDe(), contexteGescom(), "SaleInvoice", 0, "doc-200");

    expect(resultat.echeances).toEqual([
      { date: "2026-03-01", montant: "600", reste_du: "600", mode_paiement_id: "4" },
      { date: "2026-04-01", montant: "600", reste_du: "100", mode_paiement_id: null },
    ]);
  });
});

describe("hubbix-gescom/routage.ts — critère #2 : table exhaustive (5 types × 2 statuts)", () => {
  it("acompte facture : Provisional et Validated routent sur l'unique route documentée", () => {
    expect(resoudreRouteDetail("SaleDepositInvoice", 0)).toBe("gc-sale-deposit-invoice-detail");
    expect(resoudreRouteDetail("SaleDepositInvoice", 1)).toBe("gc-sale-deposit-invoice-detail");
  });

  it("acompte avoir : Provisional et Validated routent sur l'unique route documentée", () => {
    expect(resoudreRouteDetail("SaleDepositCredit", 0)).toBe("gc-sale-deposit-credit-detail");
    expect(resoudreRouteDetail("SaleDepositCredit", 1)).toBe("gc-sale-deposit-credit-detail");
  });

  it("table exhaustive pour les 5 types connus × 2 statuts connus", () => {
    const attendu: Record<string, Record<number, string>> = {
      SaleInvoice: { 0: "gc-sale-invoice-detail", 1: "gc-sale-invoice-validated-detail" },
      SaleCredit: { 0: "gc-sale-credit-detail", 1: "gc-sale-credit-validated-detail" },
      SaleQuote: { 0: "gc-sale-quote-detail", 1: "gc-sale-quote-invoiced-detail" },
      SaleDepositInvoice: { 0: "gc-sale-deposit-invoice-detail", 1: "gc-sale-deposit-invoice-detail" },
      SaleDepositCredit: { 0: "gc-sale-deposit-credit-detail", 1: "gc-sale-deposit-credit-detail" },
    };
    for (const [type, parStatut] of Object.entries(attendu)) {
      for (const [statut, routeAttendue] of Object.entries(parStatut)) {
        expect(resoudreRouteDetail(type, Number(statut))).toBe(routeAttendue);
      }
    }
  });
});

describe("hubbix-gescom/routage.ts — critère #3 : type/statut inconnu, zéro appel réseau", () => {
  it("documentType inconnu ⇒ UNSUPPORTED_CAPABILITY, aucune requête émise, action pertinente (pas celle de la résolution client par code)", async () => {
    const d = deps([]);
    await expect(
      lireDetailDocumentVente(d, budgetDe(), contexteGescom(), "SaleProforma", 0, "doc-1"),
    ).rejects.toMatchObject({
      erreur: {
        code: "UNSUPPORTED_CAPABILITY",
        action: expect.stringContaining("documentType"),
        details: { capacite: "resoudre_route_detail_document_type" },
      },
    });
    expect(d.transport.appels).toHaveLength(0);
  });

  it("documentStatus inconnu ⇒ UNSUPPORTED_CAPABILITY, aucune requête émise", async () => {
    const d = deps([]);
    await expect(
      lireDetailDocumentVente(d, budgetDe(), contexteGescom(), "SaleInvoice", 2, "doc-1"),
    ).rejects.toMatchObject({ erreur: { code: "UNSUPPORTED_CAPABILITY" } });
    expect(d.transport.appels).toHaveLength(0);
  });

  it("documentStatus absent ⇒ UNSUPPORTED_CAPABILITY, aucune requête émise", async () => {
    const d = deps([]);
    await expect(
      lireDetailDocumentVente(d, budgetDe(), contexteGescom(), "SaleInvoice", undefined, "doc-1"),
    ).rejects.toMatchObject({ erreur: { code: "UNSUPPORTED_CAPABILITY" } });
    expect(d.transport.appels).toHaveLength(0);
  });
});

describe("hubbix-gescom/documents-detail.ts — critère #4 : 404 sans repli vers une autre route", () => {
  it("404 sur la facture provisoire : NOT_FOUND, aucun essai sur la route validée", async () => {
    const d = deps([{ status: 404, corps: { status: 404, errorCode: "SaleInvoice.NotFound" } }]);

    await expect(
      lireDetailDocumentVente(d, budgetDe(), contexteGescom(), "SaleInvoice", 0, "doc-inconnu"),
    ).rejects.toMatchObject({ erreur: { code: "NOT_FOUND" } });
    expect(d.transport.appels).toHaveLength(1);
    expect(d.transport.appels[0]!.url).toContain("/sale-invoices/doc-inconnu");
  });
});
