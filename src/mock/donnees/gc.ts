/**
 * Jeu de démonstration SYNTHÉTIQUE pour le dossier `hubbix-gescom` (T13-1, mode mock). Toutes les
 * valeurs sont fictives : noms contenant « Démo », adresses `@example.invalid` (quand un email
 * apparaît), montants inventés. Aucune donnée réelle observée chez EBP n'est recopiée ici ; les
 * formes (clés, enveloppes) sont alignées sur `tests/corpus/ebp/*.json` (02 §3) mais les valeurs
 * sont inventées pour la démo.
 */
import type { JeuGc } from "../transport.js";

/** GUID du dossier `demo-gc`, identique à `examples/config.demo.json` (ne pas modifier sans y resynchroniser). */
export const DOMAIN_ID_DEMO_GC = "22222222-2222-4222-8222-222222222222";

export const CLIENT_ID_DEMO_GC = "cli-demo-1";

const CUSTOMER_DEMO = {
  code: "CLI001",
  name: "Client Démo GC Un",
  siret: null,
  intracommunityVatNumber: null,
  customerGroupId: "grp-1",
  settlementTermId: "cond-30j",
  balanceDue: "1287.50",
  pastDueBalance: "430.00",
};

/** 55 articles synthétiques : garantit plus d'une page de sortie (limite par défaut 50, 07 §5). */
function construireItems(): unknown[] {
  const items: unknown[] = [];
  for (let i = 1; i <= 55; i += 1) {
    const estBien = i % 2 === 1;
    const code = `ART${String(i).padStart(4, "0")}`;
    const prixHt = (10 + i).toFixed(2);
    const prixTtc = ((10 + i) * 1.2).toFixed(2);
    items.push({
      id: `item-${String(i).padStart(3, "0")}`,
      code,
      label: `Article Démo ${i} (synthétique)`,
      itemType: estBien ? "GoodItem" : "ServiceItem",
      priceVatExcluded: prixHt,
      priceVatIncluded: prixTtc,
      vatRate: "20",
      itemStatus: 0,
    });
  }
  return items;
}

const ITEMS = construireItems();
const ITEM_BIEN_DETAIL = ITEMS[0] as Record<string, unknown>; // item-001, GoodItem, code ART0001
const ITEM_SERVICE_DETAIL = ITEMS[1] as Record<string, unknown>; // item-002, ServiceItem, code ART0002

const DOC_FACTURE_VALIDEE = {
  id: "doc-inv-1",
  documentType: "SaleInvoice",
  documentStatus: 1,
  name: "Client Démo GC Un",
  date: "2026-03-10",
  number: "F2026-010",
  totalAmountVatExcluded: "100.00",
  totalAmountVatIncluded: "120.00",
  netAmountVatIncluded: "120.00",
  dueAmount: "120.00",
  accountingTransferStatus: 1,
};

const DOC_AVOIR_VALIDE = {
  id: "doc-cred-1",
  documentType: "SaleCredit",
  documentStatus: 1,
  name: "Client Démo GC Un",
  date: "2026-03-12",
  number: "AV2026-003",
  totalAmountVatExcluded: "-20.00",
  totalAmountVatIncluded: "-24.00",
  netAmountVatIncluded: "-24.00",
  dueAmount: "0.00",
  accountingTransferStatus: 1,
};

const DOC_DEVIS_PROVISOIRE = {
  id: "doc-quote-1",
  documentType: "SaleQuote",
  documentStatus: 0,
  name: "Client Démo GC Un",
  date: "2026-03-01",
  number: "DEV2026-001",
  totalAmountVatExcluded: "200.00",
  totalAmountVatIncluded: "240.00",
  netAmountVatIncluded: "240.00",
  dueAmount: null,
  accountingTransferStatus: 0,
};

const DOC_ACOMPTE_FACTURE = {
  id: "doc-depinv-1",
  documentType: "SaleDepositInvoice",
  documentStatus: 0,
  name: "Client Démo GC Un",
  date: "2026-03-02",
  number: "AC2026-001",
  totalAmountVatExcluded: null,
  totalAmountVatIncluded: null,
  netAmountVatIncluded: null,
  dueAmount: null,
  accountingTransferStatus: 0,
};

const DOC_ACOMPTE_AVOIR = {
  id: "doc-depcred-1",
  documentType: "SaleDepositCredit",
  documentStatus: 0,
  name: "Client Démo GC Un",
  date: "2026-03-03",
  number: "ACAV2026-001",
  totalAmountVatExcluded: null,
  totalAmountVatIncluded: null,
  netAmountVatIncluded: null,
  dueAmount: null,
  accountingTransferStatus: 0,
};

const SALE_DOCUMENTS = [DOC_FACTURE_VALIDEE, DOC_AVOIR_VALIDE, DOC_DEVIS_PROVISOIRE, DOC_ACOMPTE_FACTURE, DOC_ACOMPTE_AVOIR];

const DOC_FACTURE_VALIDEE_DETAIL = {
  id: "doc-inv-1",
  documentType: "SaleInvoice",
  documentStatus: 1,
  name: "Client Démo GC Un",
  date: "2026-03-10",
  number: "F2026-010",
  totalAmountVatExcluded: "100.00",
  totalAmountVatIncluded: "120.00",
  netAmountVatIncluded: "120.00",
  dueAmount: "120.00",
  accountingTransferStatus: 1,
  customerId: CLIENT_ID_DEMO_GC,
  commitments: [{ date: "2026-04-10", amount: "120.00", remainingAmount: "120.00", paymentModeId: null }],
  lines: [],
  footer: null,
  vatSummaryLines: [],
};

const DOC_AVOIR_VALIDE_DETAIL = {
  id: "doc-cred-1",
  documentType: "SaleCredit",
  documentStatus: 1,
  name: "Client Démo GC Un",
  date: "2026-03-12",
  number: "AV2026-003",
  totalAmountVatExcluded: "-20.00",
  totalAmountVatIncluded: "-24.00",
  netAmountVatIncluded: "-24.00",
  dueAmount: "0.00",
  accountingTransferStatus: 1,
  customerId: CLIENT_ID_DEMO_GC,
  commitments: [],
  lines: [],
  footer: null,
  vatSummaryLines: [],
};

const DOC_DEVIS_PROVISOIRE_DETAIL = {
  id: "doc-quote-1",
  documentType: "SaleQuote",
  documentStatus: 0,
  name: "Client Démo GC Un",
  date: "2026-03-01",
  number: "DEV2026-001",
  totalAmountVatExcluded: "200.00",
  totalAmountVatIncluded: "240.00",
  netAmountVatIncluded: "240.00",
  dueAmount: null,
  accountingTransferStatus: 0,
  customerId: CLIENT_ID_DEMO_GC,
  commitments: [],
  lines: [],
  footer: null,
  vatSummaryLines: [],
  validUntil: "2026-04-01",
};

const DOC_ACOMPTE_FACTURE_DETAIL = {
  id: "doc-depinv-1",
  documentType: "SaleDepositInvoice",
  documentStatus: 0,
  name: "Client Démo GC Un",
  date: "2026-03-02",
  number: "AC2026-001",
  accountingTransferStatus: 0,
  customerId: CLIENT_ID_DEMO_GC,
  commitments: [],
  lines: [],
  footer: null,
  vatSummaryLines: [],
  amountVatIncluded: "60.00",
  remainingAmount: "60.00",
  lateAmount: "0.00",
};

const DOC_ACOMPTE_AVOIR_DETAIL = {
  id: "doc-depcred-1",
  documentType: "SaleDepositCredit",
  documentStatus: 0,
  name: "Client Démo GC Un",
  date: "2026-03-03",
  number: "ACAV2026-001",
  accountingTransferStatus: 0,
  customerId: CLIENT_ID_DEMO_GC,
  commitments: [],
  lines: [],
  footer: null,
  vatSummaryLines: [],
  amountVatIncluded: "-10.00",
  remainingAmount: "0.00",
  lateAmount: "0.00",
};

/**
 * Échéances (`/sale-commitments`) : une en retard (date antérieure à `DATE_REFERENCE_DEMO`
 * 2026-03-15, reste dû positif) et une non échue, pour le calcul à la main de
 * `jours_retard`/`en_retard` (07 §8).
 */
const ECHEANCE_EN_RETARD = {
  id: "ech-1",
  date: "2026-02-01",
  customer: { id: CLIENT_ID_DEMO_GC, name: "Client Démo GC Un", code: "CLI001" },
  document: { id: "doc-inv-1", number: "F2026-010", documentType: "SaleInvoice", documentStatus: 1 },
  paymentMode: "Chèque",
  amount: "100.00",
  remainingAmount: "100.00",
};
const ECHEANCE_A_VENIR = {
  id: "ech-2",
  date: "2026-04-01",
  customer: { id: CLIENT_ID_DEMO_GC, name: "Client Démo GC Un", code: "CLI001" },
  document: { id: "doc-inv-1", number: "F2026-010", documentType: "SaleInvoice", documentStatus: 1 },
  paymentMode: "Virement",
  amount: "50.00",
  remainingAmount: "50.00",
};

const SALE_COMMITMENTS = [ECHEANCE_EN_RETARD, ECHEANCE_A_VENIR];

const SETTLEMENT_1 = {
  code: "RG-DEMO-001",
  date: "2026-02-20",
  customerName: "Client Démo GC Un",
  amount: "500.00",
  stillToBeDistributedAmount: "0.00",
  paymentModeLabel: "Chèque",
  paymentReference: "CHQ-DEMO-123",
  settlementType: 1,
};
const SETTLEMENT_2 = {
  code: "RG-DEMO-002",
  date: "2026-02-21",
  customerName: "Client Démo GC Deux",
  amount: "200.00",
  stillToBeDistributedAmount: "50.00",
  paymentModeLabel: "Virement",
  paymentReference: "VIR-DEMO-456",
  settlementType: 2,
};

const SETTLEMENTS = [SETTLEMENT_1, SETTLEMENT_2];

const VAT_RATES = [
  { label: "Taux normal (synthétique)", rate: "20", territoriality: 0, isDefault: true },
  { label: "Taux réduit (synthétique)", rate: "5.5", territoriality: 0, isDefault: false },
];

export const JEU_GC_DEMO: JeuGc = {
  domainId: DOMAIN_ID_DEMO_GC,
  listes: {
    "gc-items": ITEMS,
    "gc-sale-documents": SALE_DOCUMENTS,
    "gc-sale-commitments": SALE_COMMITMENTS,
    "gc-settlements": SETTLEMENTS,
    "gc-vat-rates": VAT_RATES,
  },
  details: {
    "gc-customer-detail": { [CLIENT_ID_DEMO_GC]: CUSTOMER_DEMO },
    "gc-item-good-detail": { "item-001": ITEM_BIEN_DETAIL },
    "gc-item-service-detail": { "item-002": ITEM_SERVICE_DETAIL },
    "gc-sale-invoice-validated-detail": { "doc-inv-1": DOC_FACTURE_VALIDEE_DETAIL },
    "gc-sale-credit-validated-detail": { "doc-cred-1": DOC_AVOIR_VALIDE_DETAIL },
    "gc-sale-quote-detail": { "doc-quote-1": DOC_DEVIS_PROVISOIRE_DETAIL },
    "gc-sale-deposit-invoice-detail": { "doc-depinv-1": DOC_ACOMPTE_FACTURE_DETAIL },
    "gc-sale-deposit-credit-detail": { "doc-depcred-1": DOC_ACOMPTE_AVOIR_DETAIL },
  },
};
