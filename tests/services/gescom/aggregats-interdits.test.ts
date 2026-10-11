import { describe, expect, it } from "vitest";
import {
  detailDocument,
  echeancierClients,
  ficheArticle,
  listerDocumentsVenteService,
  listerReglementsService,
  rechercherArticles,
} from "../../../dist/index.js";
import { ctxGescom, depsService } from "./fixtures.js";

/** Aucun des 6 outils de lecture GC ne doit jamais renvoyer un total de CA ou d'acomptes (A01). */
const MOTIF_AGREGAT_INTERDIT = /chiffre_affaires|\bca_total\b|total_ca\b|acomptes?_total|total_acomptes?/i;

function article(id: string, code: string) {
  return {
    id,
    code,
    label: `Libellé ${code}`,
    itemType: "GoodItem",
    priceVatExcluded: "10.00",
    priceVatIncluded: "12.00",
    vatRate: "20",
    itemStatus: 0,
  };
}

function docListe(id: string) {
  return {
    id,
    documentType: "SaleInvoice",
    documentStatus: 0,
    name: "Client Alpha",
    date: "2026-02-10",
    number: `F-${id}`,
    totalAmountVatExcluded: "100.00",
    totalAmountVatIncluded: "120.00",
    netAmountVatIncluded: "120.00",
    dueAmount: "120.00",
    accountingTransferStatus: 0,
  };
}

function detailFacture(id: string) {
  return {
    ...docListe(id),
    customerId: "cli-1",
    commitments: null,
    lines: [],
    footer: null,
    vatSummaryLines: null,
  };
}

function echeance(id: string) {
  return {
    id,
    date: "2026-02-10",
    customer: { id: "tiers-1", name: "Client Alpha", code: "CLI1" },
    document: { id: "doc-1", number: "F-1", documentType: "SaleInvoice", documentStatus: 0 },
    paymentMode: "Virement",
    amount: "100.00",
    remainingAmount: "100.00",
  };
}

function reglement(code: string) {
  return {
    code,
    date: "2026-02-10",
    customerName: "Client Alpha",
    amount: "100.00",
    stillToBeDistributedAmount: "12.50",
    paymentModeLabel: "Chèque",
    paymentReference: "CHQ1",
    settlementType: 1,
  };
}

function page(elements: unknown[]) {
  return { elements, take: 50, skip: 0, total: elements.length };
}

describe("services/gescom — aucun total de CA ni d'acomptes dans aucune sortie (A01)", () => {
  it("rechercher_articles", async () => {
    const d = depsService([{ status: 200, corps: page([article("a1", "ART1")]) }]);
    const resultat = await rechercherArticles(d, ctxGescom(), {});
    expect(JSON.stringify(resultat)).not.toMatch(MOTIF_AGREGAT_INTERDIT);
  });

  it("fiche_article", async () => {
    const d = depsService([{ status: 200, corps: article("a1", "ART1") }]);
    const resultat = await ficheArticle(d, ctxGescom(), { reference: { id: "a1", type: "bien" } });
    expect(JSON.stringify(resultat)).not.toMatch(MOTIF_AGREGAT_INTERDIT);
  });

  it("lister_documents_vente", async () => {
    const d = depsService([{ status: 200, corps: page([docListe("d1")]) }]);
    const resultat = await listerDocumentsVenteService(d, ctxGescom(), {});
    expect(JSON.stringify(resultat)).not.toMatch(MOTIF_AGREGAT_INTERDIT);
  });

  it("detail_document", async () => {
    const d = depsService([{ status: 200, corps: detailFacture("d1") }]);
    const resultat = await detailDocument(d, ctxGescom(), {
      reference: { id: "d1", type: "facture", statut: "provisoire" },
    });
    expect(JSON.stringify(resultat)).not.toMatch(MOTIF_AGREGAT_INTERDIT);
  });

  it("echeancier_clients", async () => {
    const d = depsService([{ status: 200, corps: page([echeance("e1")]) }]);
    const resultat = await echeancierClients(d, ctxGescom(), {});
    expect(JSON.stringify(resultat)).not.toMatch(MOTIF_AGREGAT_INTERDIT);
  });

  it("lister_reglements", async () => {
    const d = depsService([{ status: 200, corps: page([reglement("RG-1")]) }]);
    const resultat = await listerReglementsService(d, ctxGescom(), {});
    expect(JSON.stringify(resultat)).not.toMatch(MOTIF_AGREGAT_INTERDIT);
  });
});
