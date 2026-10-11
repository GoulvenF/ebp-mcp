/**
 * Jeu de données SYNTHÉTIQUE pour le dossier de démonstration `demo-gc` (famille
 * `hubbix-gescom`), lot T13-1. Toutes les valeurs ci-dessous sont INVENTÉES par l'auteur de ce
 * module : aucune n'est recopiée d'une sortie de test de mapper, d'un corpus `tests/corpus/ebp/`
 * ou d'une observation réelle EBP. Les formes (clés JSON) suivent exactement
 * `src/adapters/hubbix-gescom/schemas-ebp.ts`, pour que les adapters réels T10 sachent les parser
 * sans modification. Noms et libellés portent systématiquement « Démo » ; aucun email autre que
 * `@example.invalid` n'apparaît dans ce fichier (vérifié par `tests/mock/provenance.test.ts`).
 */

/** GUID exact du dossier `demo-gc` dans `examples/config.demo.json` (ne jamais réinventer). */
export const DOMAIN_ID_DEMO = "22222222-2222-4222-8222-222222222222";

export const CLIENT_ID_DEMO = "cli-demo-1";

/** `/customers/{id}` : une fiche client (`id` vient de l'URL, jamais du corps). */
export const CUSTOMERS_GC: ReadonlyArray<{ readonly id: string; readonly body: Record<string, unknown> }> = [
  {
    id: CLIENT_ID_DEMO,
    body: {
      code: "CLIDEMO1",
      name: "Client Démo SARL",
      siret: "12345678900011",
      intracommunityVatNumber: "FR12345678900",
      customerGroupId: null,
      settlementTermId: null,
      balanceDue: "1200.00",
      pastDueBalance: "800.00",
    },
  },
];

/**
 * `/items` et `/items/goods|services/{id}` : deux articles démonstratifs (un bien, un service),
 * réutilisés tels quels pour la liste et pour chaque fiche de détail (`id` identique).
 */
export const ITEMS_GC: Record<string, unknown>[] = [
  {
    id: "art-bien-demo-1",
    code: "ARTDEMO001",
    label: "Article Démo Bien",
    itemType: "GoodItem",
    priceVatExcluded: "10.00",
    priceVatIncluded: "12.00",
    vatRate: "20.00",
    itemStatus: 0,
  },
  {
    id: "art-srv-demo-1",
    code: "SRVDEMO001",
    label: "Service Démo",
    itemType: "ServiceItem",
    priceVatExcluded: "50.00",
    priceVatIncluded: "60.00",
    vatRate: "20.00",
    itemStatus: 0,
  },
];

/** `/sale-documents` (liste) : cinq documents démonstratifs, un par type connu de `routage.ts`. */
export const SALE_DOCUMENTS_LISTE_GC: Record<string, unknown>[] = [
  {
    id: "doc-fact-demo-1",
    documentType: "SaleInvoice",
    documentStatus: 0,
    name: "Client Démo SARL",
    date: "2026-03-05",
    number: "FA2026-DEMO-0001",
    totalAmountVatExcluded: "1000.00",
    totalAmountVatIncluded: "1200.00",
    netAmountVatIncluded: "1200.00",
    dueAmount: "600.00",
    accountingTransferStatus: 0,
  },
  {
    id: "doc-avoir-demo-1",
    documentType: "SaleCredit",
    documentStatus: 1,
    name: "Client Démo SARL",
    date: "2026-03-08",
    number: "AV2026-DEMO-0001",
    totalAmountVatExcluded: "-100.00",
    totalAmountVatIncluded: "-120.00",
    netAmountVatIncluded: "-120.00",
    dueAmount: "0.00",
    accountingTransferStatus: 1,
  },
  {
    id: "doc-devis-demo-1",
    documentType: "SaleQuote",
    documentStatus: 0,
    name: "Client Démo SARL",
    date: "2026-03-01",
    number: "DE2026-DEMO-0001",
    totalAmountVatExcluded: "2000.00",
    totalAmountVatIncluded: "2400.00",
    netAmountVatIncluded: "2400.00",
    dueAmount: "2400.00",
    accountingTransferStatus: 0,
  },
  {
    id: "doc-acompte-demo-1",
    documentType: "SaleDepositInvoice",
    documentStatus: 0,
    name: "Client Démo SARL",
    date: "2026-03-02",
    number: "AC2026-DEMO-0001",
    totalAmountVatExcluded: "300.00",
    totalAmountVatIncluded: "360.00",
    netAmountVatIncluded: "360.00",
    dueAmount: "360.00",
    accountingTransferStatus: 0,
  },
  {
    id: "doc-acomptecredit-demo-1",
    documentType: "SaleDepositCredit",
    documentStatus: 0,
    name: "Client Démo SARL",
    date: "2026-03-03",
    number: "ACAV2026-DEMO-0001",
    totalAmountVatExcluded: "-50.00",
    totalAmountVatIncluded: "-60.00",
    netAmountVatIncluded: "-60.00",
    dueAmount: "0.00",
    accountingTransferStatus: 0,
  },
];

export type RouteDetailDocumentDemo =
  | "gc-sale-invoice-detail"
  | "gc-sale-invoice-validated-detail"
  | "gc-sale-credit-detail"
  | "gc-sale-credit-validated-detail"
  | "gc-sale-quote-detail"
  | "gc-sale-quote-invoiced-detail"
  | "gc-sale-deposit-invoice-detail"
  | "gc-sale-deposit-credit-detail";

/**
 * Fiches de détail des cinq documents ci-dessus, une par route de `routage.ts`. Les champs
 * suivent `DocumentDetailEbpSchema`/`DevisDetailEbpSchema`/`AcompteDetailEbpSchema` exactement.
 */
export const SALE_DOCUMENT_DETAILS_GC: ReadonlyArray<{
  readonly routeId: RouteDetailDocumentDemo;
  readonly body: Record<string, unknown>;
}> = [
  {
    routeId: "gc-sale-invoice-detail",
    body: {
      id: "doc-fact-demo-1",
      documentType: "SaleInvoice",
      documentStatus: 0,
      name: "Client Démo SARL",
      date: "2026-03-05",
      number: "FA2026-DEMO-0001",
      totalAmountVatExcluded: "1000.00",
      totalAmountVatIncluded: "1200.00",
      netAmountVatIncluded: "1200.00",
      dueAmount: "600.00",
      accountingTransferStatus: 0,
      customerId: CLIENT_ID_DEMO,
      commitments: [
        { date: "2026-04-05", amount: "1200.00", remainingAmount: "600.00", paymentModeId: null },
      ],
      lines: [],
      footer: null,
      vatSummaryLines: [],
    },
  },
  {
    routeId: "gc-sale-credit-validated-detail",
    body: {
      id: "doc-avoir-demo-1",
      documentType: "SaleCredit",
      documentStatus: 1,
      name: "Client Démo SARL",
      date: "2026-03-08",
      number: "AV2026-DEMO-0001",
      totalAmountVatExcluded: "-100.00",
      totalAmountVatIncluded: "-120.00",
      netAmountVatIncluded: "-120.00",
      dueAmount: "0.00",
      accountingTransferStatus: 1,
      customerId: CLIENT_ID_DEMO,
      commitments: [],
      lines: [],
      footer: null,
      vatSummaryLines: [],
    },
  },
  {
    routeId: "gc-sale-quote-detail",
    body: {
      id: "doc-devis-demo-1",
      documentType: "SaleQuote",
      documentStatus: 0,
      name: "Client Démo SARL",
      date: "2026-03-01",
      number: "DE2026-DEMO-0001",
      totalAmountVatExcluded: "2000.00",
      totalAmountVatIncluded: "2400.00",
      netAmountVatIncluded: "2400.00",
      dueAmount: "2400.00",
      accountingTransferStatus: 0,
      customerId: CLIENT_ID_DEMO,
      commitments: [],
      lines: [],
      footer: null,
      vatSummaryLines: [],
      validUntil: "2026-04-01",
    },
  },
  {
    routeId: "gc-sale-deposit-invoice-detail",
    body: {
      id: "doc-acompte-demo-1",
      documentType: "SaleDepositInvoice",
      documentStatus: 0,
      name: "Client Démo SARL",
      date: "2026-03-02",
      number: "AC2026-DEMO-0001",
      accountingTransferStatus: 0,
      customerId: CLIENT_ID_DEMO,
      commitments: [],
      lines: [],
      footer: null,
      vatSummaryLines: [],
      amountVatIncluded: "360.00",
      remainingAmount: "360.00",
      lateAmount: "0.00",
    },
  },
  {
    routeId: "gc-sale-deposit-credit-detail",
    body: {
      id: "doc-acomptecredit-demo-1",
      documentType: "SaleDepositCredit",
      documentStatus: 0,
      name: "Client Démo SARL",
      date: "2026-03-03",
      number: "ACAV2026-DEMO-0001",
      accountingTransferStatus: 0,
      customerId: CLIENT_ID_DEMO,
      commitments: [],
      lines: [],
      footer: null,
      vatSummaryLines: [],
      amountVatIncluded: "-60.00",
      remainingAmount: "0.00",
      lateAmount: "0.00",
    },
  },
];

/**
 * `/sale-commitments` (échéancier) : 5 échéances. Date de référence documentée
 * `DATE_REFERENCE_DEMO` (`src/mock/donnees/index.ts`) = `2026-10-11`. `estEnRetard` (07 §8) exige
 * `reste_du > 0 ET échéance < aujourd'hui` : exactement DEUX échéances remplissent les deux
 * conditions ici (`ech-demo-1` et `ech-demo-2`), ce qui donne un calcul à la main simple :
 * 2 échéances en retard sur 5.
 *  - `ech-demo-1` : 2026-09-01, reste dû 600,00 € ⇒ EN RETARD (passée, reste dû > 0).
 *  - `ech-demo-2` : 2026-09-20, reste dû 200,00 € ⇒ EN RETARD (passée, reste dû > 0).
 *  - `ech-demo-3` : 2026-10-11 (= aujourd'hui), reste dû 50,00 € ⇒ PAS en retard (égalité stricte exclue).
 *  - `ech-demo-4` : 2026-11-01 (future), reste dû 100,00 € ⇒ PAS en retard.
 *  - `ech-demo-5` : 2026-08-01 (passée), reste dû 0,00 € ⇒ PAS en retard (rien à payer).
 */
export const SALE_COMMITMENTS_GC: Record<string, unknown>[] = [
  {
    id: "ech-demo-1",
    date: "2026-09-01",
    customer: { id: CLIENT_ID_DEMO, name: "Client Démo SARL", code: "CLIDEMO1" },
    document: { id: "doc-fact-demo-1", number: "FA2026-DEMO-0001", documentType: "SaleInvoice", documentStatus: 0 },
    paymentMode: "Virement Démo",
    amount: "1200.00",
    remainingAmount: "600.00",
  },
  {
    id: "ech-demo-2",
    date: "2026-09-20",
    customer: { id: CLIENT_ID_DEMO, name: "Client Démo SARL", code: "CLIDEMO1" },
    document: { id: "doc-acompte-demo-1", number: "AC2026-DEMO-0001", documentType: "SaleDepositInvoice", documentStatus: 0 },
    paymentMode: "Virement Démo",
    amount: "360.00",
    remainingAmount: "200.00",
  },
  {
    id: "ech-demo-3",
    date: "2026-10-11",
    customer: { id: CLIENT_ID_DEMO, name: "Client Démo SARL", code: "CLIDEMO1" },
    document: { id: "doc-devis-demo-1", number: "DE2026-DEMO-0001", documentType: "SaleQuote", documentStatus: 0 },
    paymentMode: "Virement Démo",
    amount: "2400.00",
    remainingAmount: "50.00",
  },
  {
    id: "ech-demo-4",
    date: "2026-11-01",
    customer: { id: CLIENT_ID_DEMO, name: "Client Démo SARL", code: "CLIDEMO1" },
    document: { id: "doc-fact-demo-1", number: "FA2026-DEMO-0001", documentType: "SaleInvoice", documentStatus: 0 },
    paymentMode: "Virement Démo",
    amount: "100.00",
    remainingAmount: "100.00",
  },
  {
    id: "ech-demo-5",
    date: "2026-08-01",
    customer: { id: CLIENT_ID_DEMO, name: "Client Démo SARL", code: "CLIDEMO1" },
    document: { id: "doc-avoir-demo-1", number: "AV2026-DEMO-0001", documentType: "SaleCredit", documentStatus: 1 },
    paymentMode: "Virement Démo",
    amount: "0.00",
    remainingAmount: "0.00",
  },
];

/** `/settlements` : aucun identifiant unique documenté (A14) ; un règlement démonstratif. */
export const SETTLEMENTS_GC: Record<string, unknown>[] = [
  {
    code: "REGDEMO0001",
    date: "2026-03-10",
    customerName: "Client Démo SARL",
    amount: "600.00",
    stillToBeDistributedAmount: "0.00",
    paymentModeLabel: "Virement Démo",
    paymentReference: "VIR-DEMO-0001",
    settlementType: 1,
  },
];

/** `/vat-rates` (tableau nu) : deux taux démonstratifs. */
export const VAT_RATES_GC: Record<string, unknown>[] = [
  { label: "Taux normal Démo", rate: "20.00", territoriality: 0, isDefault: true },
  { label: "Taux réduit Démo", rate: "5.50", territoriality: 0, isDefault: false },
];
