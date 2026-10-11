/**
 * Jeu de démonstration SYNTHÉTIQUE pour le dossier `hubbix-compta` (T13-1, mode mock). Toutes les
 * valeurs sont fictives : noms contenant « Démo », adresses `@example.invalid`, IBAN factice.
 * Aucune donnée réelle observée chez EBP n'est recopiée ici ; les formes (clés, enveloppes) sont
 * alignées sur `tests/corpus/ebp/*.json` (02 §2) mais les valeurs sont inventées pour la démo.
 */
import type { JeuCpt } from "../transport.js";

/** GUID du dossier `demo-cpt`, identique à `examples/config.demo.json` (ne pas modifier sans y resynchroniser). */
export const TENANT_ID_DEMO_CPT = "11111111-1111-4111-8111-111111111111";

const DOMAIN_INFORMATION = {
  domainName: "Domaine Démo Compta (synthétique)",
  domainCode: "DEMOCPT",
  version: null,
};

const FOLDER_SETTINGS = {
  exercices: [{ startDate: "2026-01-01", endDate: "2026-12-31", exerciceNumber: 1, closingDate: null }],
  entry: { mode: "Validé" },
};

const AUXILIARY_ACCOUNT_TYPES = [
  { code: "C", collectiveAccount: "411000" },
  { code: "F", collectiveAccount: "401000" },
];

const TIERS_1 = {
  uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
  name: "Client Démo Un",
  number: "4010001",
  vatNumber: null,
  siret: null,
  isActive: true,
  types: ["C"],
};

const TIERS_2 = {
  uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
  name: "Client Démo Deux",
  number: "4010002",
  vatNumber: null,
  siret: null,
  isActive: true,
  types: ["C"],
};

const AUXILIARY_ACCOUNTS = [TIERS_1, TIERS_2];

/** Fiche détail : étend la liste avec `contact.email` (synthétique, `@example.invalid`). */
const TIERS_1_DETAIL = { ...TIERS_1, contact: { email: "client.demo1@example.invalid" } };
const TIERS_2_DETAIL = { ...TIERS_2, contact: { email: "client.demo2@example.invalid" } };

const COMPTE_CLIENTS = { uuid: "gl-411000", number: "411000", label: "Clients (synthétique)", active: true, collective: true, racine: false };
const COMPTE_ACHATS = { uuid: "gl-607000", number: "607000", label: "Achats de marchandises (synthétique)", active: true, collective: false, racine: false };

const GENERAL_ACCOUNTS = [COMPTE_CLIENTS, COMPTE_ACHATS];

const JOURNAL_VENTES = { uuid: "jrn-ve", code: "VE", name: "Ventes (synthétique)", journalType: { name: "Ventes" }, counterpartAccount: "411000" };
const JOURNAL_BANQUE = { uuid: "jrn-bq", code: "BQ", name: "Banque (synthétique)", journalType: { name: "Banque" }, counterpartAccount: "512000" };

const JOURNALS = [JOURNAL_VENTES, JOURNAL_BANQUE];

/**
 * Lignes d'écriture CPT (`/lines-entries`) : reproduit à l'identique l'exemple à la main de
 * 07 §8 pour le compte 411000 — débit total 150, crédit total 40, solde 110 — plus une ligne hors
 * fenêtre [2026-03-01, 2026-03-31] (février) pour exercer le filtrage local par date, et une ligne
 * sur le compte 607000 pour un second compte dans la balance.
 */
const LIGNE_FACTURE_1 = {
  entry: { journal: "VE", date: "2026-03-05", entryMode: "Validé" },
  generalAccount: "411000",
  auxiliaryAccount: "4010001",
  label: "Facture Client Démo Un",
  debit: "100.00",
  credit: null,
  piece: "FA2026-010",
  document: null,
  deadline: "2026-04-05",
  lettering: null,
};
const LIGNE_FACTURE_2 = {
  entry: { journal: "VE", date: "2026-03-10", entryMode: "Validé" },
  generalAccount: "411000",
  auxiliaryAccount: "4010002",
  label: "Facture Client Démo Deux",
  debit: "50.00",
  credit: null,
  piece: "FA2026-011",
  document: null,
  deadline: "2026-04-10",
  lettering: null,
};
const LIGNE_REGLEMENT = {
  entry: { journal: "BQ", date: "2026-03-12", entryMode: "Validé" },
  generalAccount: "411000",
  auxiliaryAccount: "4010001",
  label: "Règlement reçu (synthétique)",
  debit: null,
  credit: "40.00",
  piece: "REG-2026-001",
  document: null,
  deadline: null,
  lettering: "A",
};
const LIGNE_HORS_FENETRE = {
  entry: { journal: "VE", date: "2026-02-01", entryMode: "Validé" },
  generalAccount: "411000",
  auxiliaryAccount: "4010001",
  label: "Facture hors fenêtre de test (synthétique)",
  debit: "20.00",
  credit: null,
  piece: "FA2026-001",
  document: null,
  deadline: "2026-03-01",
  lettering: null,
};
const LIGNE_ACHAT = {
  entry: { journal: "BQ", date: "2026-03-07", entryMode: "Provisoire" },
  generalAccount: "607000",
  auxiliaryAccount: null,
  label: "Achat fournitures (synthétique)",
  debit: "80.00",
  credit: null,
  piece: "FA-FOURN-2026-001",
  document: null,
  deadline: null,
  lettering: null,
};

const LINES_ENTRIES = [LIGNE_FACTURE_1, LIGNE_FACTURE_2, LIGNE_REGLEMENT, LIGNE_HORS_FENETRE, LIGNE_ACHAT];

/** UUID d'écriture pour `detail_ecriture` (synthétique). */
export const UUID_ECRITURE_DEMO = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";

const ENTRY_DETAIL = {
  uuid: UUID_ECRITURE_DEMO,
  journal: "VE",
  date: "2026-03-05",
  entryMode: "Validé",
  lines: [
    {
      generalAccount: "411000",
      auxiliaryAccount: "4010001",
      label: "Facture Client Démo Un",
      debit: "100.00",
      credit: null,
      piece: "FA2026-010",
      document: null,
      deadline: "2026-04-05",
      lettering: null,
    },
  ],
};

const SEARCH_ENTRIES = [
  {
    generalAccount: "411000",
    thirdAccount: "4010001",
    label: "Règlement client (synthétique)",
    debit: null,
    credit: "40.00",
    piece: "REG-2026-001",
    deadline: null,
    lettering: null,
  },
];

/** IBAN clairement factice (synthétique), jamais un IBAN réel. */
const IBAN_DEMO = "FR7630006000011234567890189";

const TRANSACTION_1 = {
  label: "Virement reçu (synthétique)",
  account: { bankName: "Banque Démo (synthétique)", iban: IBAN_DEMO, balance: null },
  operationDate: "2026-03-01",
  valueDate: "2026-03-02",
  debit: null,
  credit: "500.00",
  reference: "VIR-2026-001",
  status: 1,
};
const TRANSACTION_2 = {
  label: "Prélèvement fournisseur (synthétique)",
  account: { bankName: "Banque Démo (synthétique)", iban: IBAN_DEMO, balance: null },
  operationDate: "2026-03-05",
  valueDate: "2026-03-05",
  debit: "120.00",
  credit: null,
  reference: "PRLV-2026-002",
  status: 1,
};

const BANK_TRANSACTIONS = [TRANSACTION_1, TRANSACTION_2];

const VAT_RATE = [{ designation: "TVA normale (synthétique)", rate: "20.00", isActive: true, territoriality: 1 }];

export const JEU_CPT_DEMO: JeuCpt = {
  tenantId: TENANT_ID_DEMO_CPT,
  fiches: {
    "cpt-domain-information": DOMAIN_INFORMATION,
    "cpt-folder-settings": FOLDER_SETTINGS,
  },
  listes: {
    "cpt-auxiliary-account-types": AUXILIARY_ACCOUNT_TYPES,
    "cpt-auxiliary-accounts": AUXILIARY_ACCOUNTS,
    "cpt-general-account": GENERAL_ACCOUNTS,
    "cpt-journals": JOURNALS,
    "cpt-lines-entries": LINES_ENTRIES,
    "cpt-search-entries": SEARCH_ENTRIES,
    "cpt-bank-transactions": BANK_TRANSACTIONS,
    "cpt-vat-rate": VAT_RATE,
  },
  details: {
    "cpt-auxiliary-account-detail": { "4010001": TIERS_1_DETAIL, "4010002": TIERS_2_DETAIL },
    "cpt-general-account-detail": { "411000": COMPTE_CLIENTS, "607000": COMPTE_ACHATS },
    "cpt-journal-detail": { VE: JOURNAL_VENTES, BQ: JOURNAL_BANQUE },
    "cpt-entry-detail": { [UUID_ECRITURE_DEMO]: ENTRY_DETAIL },
  },
};
