import { describe, expect, it } from "vitest";
import { detailDocument, listerDocumentsVenteService } from "../../../dist/index.js";
import { ctxComptaSurOutilGc, ctxGescom, depsService } from "./fixtures.js";

function docListe(id: string, overrides: Record<string, unknown> = {}) {
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
    ...overrides,
  };
}

function pageDocuments(elements: unknown[], total = elements.length) {
  return { elements, take: 50, skip: 0, total };
}

function detailFacture(id: string, overrides: Record<string, unknown> = {}) {
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
    customerId: "cli-1",
    commitments: null,
    lines: [],
    footer: null,
    vatSummaryLines: null,
    ...overrides,
  };
}

describe("services/gescom/documents.ts — garde de famille (D-T11-1)", () => {
  it("lister_documents_vente sur dossier CPT ⇒ UNSUPPORTED_CAPABILITY, 0 appel transport", async () => {
    const d = depsService([]);
    await expect(listerDocumentsVenteService(d, ctxComptaSurOutilGc(), {})).rejects.toMatchObject({
      erreur: { code: "UNSUPPORTED_CAPABILITY" },
    });
    expect(d.transport.appels).toHaveLength(0);
  });

  it("detail_document sur dossier CPT ⇒ UNSUPPORTED_CAPABILITY, 0 appel transport", async () => {
    const d = depsService([]);
    await expect(detailDocument(d, ctxComptaSurOutilGc(), { numero: "F-1" })).rejects.toMatchObject({
      erreur: { code: "UNSUPPORTED_CAPABILITY" },
    });
    expect(d.transport.appels).toHaveLength(0);
  });
});

describe("services/gescom/documents.ts — lister_documents_vente : capacités et validation (D-T11-6/D-T11-7)", () => {
  it("type non supporté (`commande`) ⇒ refus avant réseau", async () => {
    const d = depsService([]);
    await expect(listerDocumentsVenteService(d, ctxGescom(), { types: ["commande"] })).rejects.toMatchObject({
      erreur: { code: "UNSUPPORTED_CAPABILITY" },
    });
    expect(d.transport.appels).toHaveLength(0);
  });

  it("`statut: \"facture\"` sans `devis` dans `types` ⇒ INVALID_ARGUMENT avant réseau", async () => {
    const d = depsService([]);
    await expect(
      listerDocumentsVenteService(d, ctxGescom(), { types: ["facture"], statut: "facture" }),
    ).rejects.toMatchObject({ erreur: { code: "INVALID_ARGUMENT" } });
    expect(d.transport.appels).toHaveLength(0);
  });
});

describe("services/gescom/documents.ts — filtre `statut` : `facture` vs `valide` (D-T11-7, correctif revue PR#19)", () => {
  it("`statut: \"facture\"` ⇒ ne conserve que les devis au statut 1, écarte les factures validées", async () => {
    const pageListe = pageDocuments([
      docListe("devis-1", { documentType: "SaleQuote", documentStatus: 1, number: "D-1" }),
      docListe("facture-1", { documentType: "SaleInvoice", documentStatus: 1, number: "F-1" }),
    ]);
    const d = depsService([{ status: 200, corps: pageListe }]);
    const resultat = await listerDocumentsVenteService(d, ctxGescom(), {
      types: ["devis", "facture"],
      statut: "facture",
    });
    expect(resultat.resultats.map((doc) => doc.id)).toEqual(["devis-1"]);
  });

  it("`statut: \"valide\"` ⇒ ne conserve que les documents validés hors devis, écarte un devis facturé", async () => {
    const pageListe = pageDocuments([
      docListe("devis-1", { documentType: "SaleQuote", documentStatus: 1, number: "D-1" }),
      docListe("facture-1", { documentType: "SaleInvoice", documentStatus: 1, number: "F-1" }),
    ]);
    const d = depsService([{ status: 200, corps: pageListe }]);
    const resultat = await listerDocumentsVenteService(d, ctxGescom(), {
      types: ["devis", "facture"],
      statut: "valide",
    });
    expect(resultat.resultats.map((doc) => doc.id)).toEqual(["facture-1"]);
  });
});

describe("services/gescom/documents.ts — `inclure_brut` (D-T11-14, correctif revue PR#19)", () => {
  it("`inclure_brut: true` avec filtre `tiers` (après enrichissement) ⇒ `bruts` aligné 1:1 avec `resultats`", async () => {
    const pageListe = pageDocuments([docListe("d1")]);
    const d = depsService([
      { status: 200, corps: pageListe },
      { status: 200, corps: detailFacture("d1", { customerId: "tiers-1" }) },
    ]);
    const resultat = await listerDocumentsVenteService(d, ctxGescom(), { tiers: "tiers-1", inclure_brut: true });
    expect(resultat.resultats.map((doc) => doc.id)).toEqual(["d1"]);
    expect(resultat.bruts).toHaveLength(1);
    expect(resultat.bruts![0]).toMatchObject({ id: "d1" });
  });

  it("second appel identique servi par le cache avec `inclure_brut: true` ⇒ `bruts` non nuls et alignés", async () => {
    const pageListe = pageDocuments([docListe("d1")]);
    const d = depsService([{ status: 200, corps: pageListe }]);

    const premier = await listerDocumentsVenteService(d, ctxGescom(), { inclure_brut: false });
    expect(premier.bruts).toBeNull();
    expect(d.transport.appels).toHaveLength(1);

    const second = await listerDocumentsVenteService(d, ctxGescom(), { inclure_brut: true });
    // Page servie depuis le cache : aucun appel transport de plus.
    expect(d.transport.appels).toHaveLength(1);
    expect(second.resultats.map((doc) => doc.id)).toEqual(["d1"]);
    expect(second.bruts).toHaveLength(1);
    expect(second.bruts![0]).toMatchObject({ id: "d1" });
  });

  it("`detail_document` : `inclure_brut: true` ⇒ `bruts` aligné 1:1 sur la fiche", async () => {
    const d = depsService([{ status: 200, corps: detailFacture("d1") }]);
    const resultat = await detailDocument(d, ctxGescom(), {
      reference: { id: "d1", type: "facture", statut: "provisoire" },
      inclure_brut: true,
    });
    expect(resultat.bruts).toHaveLength(1);
    expect(resultat.bruts![0]).toMatchObject({ id: "d1" });
  });
});

describe("services/gescom/documents.ts — lister_documents_vente : filtre `tiers` (D-T11-8/A14)", () => {
  it("conserve un document dont le détail porte l'ID, écarte un document de même nom mais d'autre ID", async () => {
    const page = pageDocuments([docListe("d1", { name: "Client X" }), docListe("d2", { name: "Client X" })]);
    const d = depsService([
      { status: 200, corps: page },
      { status: 200, corps: detailFacture("d1", { customerId: "tiers-1" }) },
      { status: 200, corps: detailFacture("d2", { customerId: "tiers-2" }) },
    ]);

    const resultat = await listerDocumentsVenteService(d, ctxGescom(), { tiers: "tiers-1" });

    expect(resultat.resultats.map((doc) => doc.id)).toEqual(["d1"]);
    // 1 appel de page + 2 lectures de détail (un par candidat local) : jamais une troisième requête.
    expect(d.transport.appels).toHaveLength(3);
  });

  it("un candidat déjà exclu par un filtre local (date) n'est jamais enrichi", async () => {
    const page = pageDocuments([docListe("d1", { date: "2020-01-01" }), docListe("d2", { date: "2026-02-10" })]);
    const d = depsService([
      { status: 200, corps: page },
      { status: 200, corps: detailFacture("d2", { customerId: "tiers-1" }) },
    ]);

    const resultat = await listerDocumentsVenteService(d, ctxGescom(), { tiers: "tiers-1", du: "2026-01-01" });

    expect(resultat.resultats.map((doc) => doc.id)).toEqual(["d2"]);
    // 1 appel de page + 1 seule lecture de détail : `d1` écarté par la date, jamais enrichi.
    expect(d.transport.appels).toHaveLength(2);
  });

  it("détail à `tiers_id` null ⇒ exclu, compté, résultat `approximatif`", async () => {
    const page = pageDocuments([docListe("d1")]);
    const d = depsService([
      { status: 200, corps: page },
      { status: 200, corps: detailFacture("d1", { customerId: null }) },
    ]);

    const resultat = await listerDocumentsVenteService(d, ctxGescom(), { tiers: "tiers-1" });

    expect(resultat.resultats).toHaveLength(0);
    expect(resultat.approximatif).toBe(true);
    expect(resultat.completude).toBe("partielle");
    expect(resultat.avertissements.some((a) => a.includes("non vérifiable"))).toBe(true);
  });

  it("budget épuisé pendant l'enrichissement ⇒ résultat partiel, raison renseignée", async () => {
    const page = pageDocuments([docListe("d1"), docListe("d2")]);
    const d = depsService([
      { status: 200, corps: page },
      { status: 200, corps: detailFacture("d1", { customerId: "tiers-1" }) },
    ]);

    const resultat = await listerDocumentsVenteService(d, ctxGescom({ budgetRestant: 2 }), { tiers: "tiers-1" });

    expect(resultat.completude).toBe("partielle");
    expect(resultat.raison_arret).not.toBeNull();
  });

  it("le nombre de lectures de détail figure dans les avertissements", async () => {
    const page = pageDocuments([docListe("d1")]);
    const d = depsService([
      { status: 200, corps: page },
      { status: 200, corps: detailFacture("d1", { customerId: "tiers-1" }) },
    ]);

    const resultat = await listerDocumentsVenteService(d, ctxGescom(), { tiers: "tiers-1" });

    expect(resultat.avertissements.some((a) => a.includes("lecture(s) de détail"))).toBe(true);
  });
});

describe("services/gescom/documents.ts — detail_document (D-T11-7)", () => {
  it("référence ⇒ une seule route appelée", async () => {
    const d = depsService([{ status: 200, corps: detailFacture("d1") }]);
    const resultat = await detailDocument(d, ctxGescom(), {
      reference: { id: "d1", type: "facture", statut: "provisoire" },
    });
    expect(resultat.resultats[0]!.id).toBe("d1");
    expect(d.transport.appels).toHaveLength(1);
  });

  it("404 sur la route résolue ⇒ NOT_FOUND, transport appelé une seule fois", async () => {
    const d = depsService([{ status: 404, corps: { status: 404, errorCode: "Document.NotFound" } }]);
    await expect(
      detailDocument(d, ctxGescom(), { reference: { id: "inconnu", type: "facture", statut: "provisoire" } }),
    ).rejects.toMatchObject({ erreur: { code: "NOT_FOUND" } });
    expect(d.transport.appels).toHaveLength(1);
  });

  it("numéro ambigu (deux correspondances exactes) ⇒ AMBIGUOUS_REFERENCE", async () => {
    const page = pageDocuments([docListe("d1", { number: "DUP" }), docListe("d2", { number: "DUP" })]);
    const d = depsService([{ status: 200, corps: page }]);
    await expect(detailDocument(d, ctxGescom(), { numero: "DUP" })).rejects.toMatchObject({
      erreur: { code: "AMBIGUOUS_REFERENCE" },
    });
  });

  it("scan par numéro interrompu (budget) ⇒ RESOLUTION_INCOMPLETE", async () => {
    const page = pageDocuments([docListe("d1", { number: "AUTRE" })], 4);
    const d = depsService([{ status: 200, corps: page }]);
    await expect(
      detailDocument(d, ctxGescom({ budgetRestant: 1 }), { numero: "INTROUVABLE" }),
    ).rejects.toMatchObject({ erreur: { code: "RESOLUTION_INCOMPLETE" } });
  });

  it("`avec_lignes: false` ⇒ `lignes: null`, même appel unique", async () => {
    const d = depsService([{ status: 200, corps: detailFacture("d1", { lines: [{ id: "l1" }] }) }]);
    const resultat = await detailDocument(d, ctxGescom(), {
      reference: { id: "d1", type: "facture", statut: "provisoire" },
      avec_lignes: false,
    });
    expect(resultat.resultats[0]!.lignes).toBeNull();
    expect(d.transport.appels).toHaveLength(1);
  });
});
