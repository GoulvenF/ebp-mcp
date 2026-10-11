/**
 * Jeu de données SYNTHÉTIQUE pour le dossier de démonstration `demo-cpt` (famille
 * `hubbix-compta`), lot T13-1. Toutes les valeurs ci-dessous sont INVENTÉES par l'auteur de ce
 * module : aucune n'est recopiée d'une sortie de test de mapper, d'un corpus `tests/corpus/ebp/`
 * ou d'une observation réelle EBP. Les formes (clés JSON) suivent exactement
 * `src/adapters/compta/schemas-ebp.ts`, pour que les adapters réels T09 sachent les parser sans
 * modification. Noms et libellés portent systématiquement « Démo » ; aucun email autre que
 * `@example.invalid` n'apparaît dans ce fichier (vérifié par `tests/mock/provenance.test.ts`).
 */

/** GUID exact du dossier `demo-cpt` dans `examples/config.demo.json` (ne jamais réinventer). */
export const TENANT_ID_DEMO = "11111111-1111-4111-8111-111111111111";

/** `/domain-information` (fiche sans wrapper). */
export const DOMAIN_INFORMATION_CPT = {
  domainName: "Domaine Démo Comptabilité",
  domainCode: "DEMOCPT",
  version: "2026.1.0-demo",
};

/** `/folder-settings` : un seul exercice ouvert, mode de saisie « Provisoire ». */
export const FOLDER_SETTINGS_CPT = {
  exercices: [{ startDate: "2026-01-01", endDate: "2026-12-31", exerciceNumber: 2026, closingDate: null }],
  entry: { mode: "Provisoire" },
};

/** `/auxiliary-account-types` : les cinq types documentés (02 §2, forme en prose). */
export const AUXILIARY_ACCOUNT_TYPES_CPT = [
  { code: "C", collectiveAccount: "411000" },
  { code: "F", collectiveAccount: "401000" },
  { code: "S", collectiveAccount: "421000" },
  { code: "O", collectiveAccount: "437000" },
  { code: "A", collectiveAccount: "467000" },
] as const;

/**
 * `/auxiliary-accounts` : 125 tiers synthétiques, dont le premier (`4010001`) sert de fiche
 * détaillée pour `fiche_tiers`/PII (email `@example.invalid`). Le volume (125 > taille de page
 * par défaut 100 côté moteur de scan, et > 50 pour un appel direct au transport) garantit
 * plusieurs pages lors d'un parcours complet (exigence « pagination multi-pages » du lot).
 */
export const AUXILIARY_ACCOUNTS_CPT: Record<string, unknown>[] = [
  {
    uuid: "550e8400-e29b-41d4-a716-446655440010",
    name: "Client Démo Principal",
    number: "4010001",
    vatNumber: "FR00000000010",
    siret: "10000000000010",
    isActive: true,
    types: ["C"],
    contact: { email: "client-demo@example.invalid" },
  },
  ...Array.from({ length: 124 }, (_, index) => {
    const n = index + 2; // 2..125
    return {
      uuid: `550e8400-e29b-41d4-a716-${String(440010 + n).padStart(12, "0")}`,
      name: `Tiers Démo ${n}`,
      number: `40100${String(n).padStart(2, "0")}`,
      vatNumber: null,
      siret: null,
      isActive: n % 5 !== 0, // quelques tiers inactifs, synthétique
      types: ["C"],
      contact: { email: null },
    };
  }),
];

/** `/general-account` : quelques comptes généraux démonstratifs (racine, collectif, détail). */
export const GENERAL_ACCOUNTS_CPT: Record<string, unknown>[] = [
  { uuid: "gc-acc-1", number: "101000", label: "Capital Démo", active: true, collective: false, racine: true },
  { uuid: "gc-acc-2", number: "411000", label: "Clients Démo", active: true, collective: true, racine: false },
  { uuid: "gc-acc-3", number: "606100", label: "Fournitures Démo", active: true, collective: false, racine: false },
  { uuid: "gc-acc-4", number: "445710", label: "TVA collectée Démo", active: true, collective: false, racine: false },
];

/** `/journals` : deux journaux démonstratifs (Achats, Ventes), utilisés par `linesEntries` ci-dessous. */
export const JOURNALS_CPT: Record<string, unknown>[] = [
  { uuid: "j-ac-demo", code: "AC", name: "Achats Démo", journalType: { name: "Achats" }, counterpartAccount: "401000" },
  { uuid: "j-ve-demo", code: "VE", name: "Ventes Démo", journalType: { name: "Ventes" }, counterpartAccount: "411000" },
];

/**
 * `/lines-entries` : 120 lignes synthétiques réparties exactement en deux comptes, pour un calcul
 * à la main simple de `balance_comptes` : 60 lignes au débit du compte `606100` (classe 6) à
 * 100,00 € chacune (total débit = 6000,00 €, crédit = 0) et 60 lignes au crédit du compte
 * `411000` (classe 4) à 100,00 € chacune (total crédit = 6000,00 €, débit = 0). Toutes datées du
 * 2026-03-02, dans la période de test `[2026-03-01, 2026-03-31]`. Le volume (120 > 100, la taille
 * de page par défaut du moteur de scan) garantit deux pages serveur (100 puis 20).
 */
export const LINES_ENTRIES_CPT: Record<string, unknown>[] = Array.from({ length: 120 }, (_, i) => {
  const compteDebit = i % 2 === 0;
  return {
    entry: { journal: compteDebit ? "AC" : "VE", date: "2026-03-02", entryMode: "Validé" },
    generalAccount: compteDebit ? "606100" : "411000",
    auxiliaryAccount: compteDebit ? null : "4010001",
    label: `Mouvement démo ${i}`,
    debit: compteDebit ? "100.00" : null,
    credit: compteDebit ? null : "100.00",
    piece: `PCE-DEMO-${String(i).padStart(4, "0")}`,
    document: null,
    deadline: null,
    lettering: null,
  };
});

/** `/entries/{uuid}` : une écriture complète (3 lignes) pour `detail_ecriture`. */
export const ENTRIES_CPT: Record<string, unknown>[] = [
  {
    uuid: "660e8400-e29b-41d4-a716-446655440020",
    journal: "VE",
    date: "2026-03-10",
    entryMode: "Validé",
    lines: [
      {
        generalAccount: "411000",
        auxiliaryAccount: "4010001",
        label: "Facture Démo FA2026-0001",
        debit: "1200.00",
        credit: null,
        piece: "FA2026-0001",
        document: null,
        deadline: "2026-04-10",
        lettering: null,
      },
      {
        generalAccount: "707000",
        auxiliaryAccount: null,
        label: "Vente Démo",
        debit: null,
        credit: "1000.00",
        piece: "FA2026-0001",
        document: null,
        deadline: null,
        lettering: null,
      },
      {
        generalAccount: "445710",
        auxiliaryAccount: null,
        label: "TVA collectée Démo",
        debit: null,
        credit: "200.00",
        piece: "FA2026-0001",
        document: null,
        deadline: null,
        lettering: null,
      },
    ],
  },
];

/**
 * `/bank-transactions` : un virement reçu, avec un IBAN clairement FICTIF (préfixe `FR76XXXX…`,
 * structure à 27 caractères mais non numérique au-delà du code pays/clé : ce n'est PAS un IBAN
 * réel ni valide, uniquement une chaîne de démonstration facilement reconnaissable comme factice).
 */
export const BANK_TRANSACTIONS_CPT: Record<string, unknown>[] = [
  {
    label: "Virement reçu Démo",
    account: { bankName: "Banque Démo", iban: "FR76XXXXXXXXXXXXXXXXXXXXXXX", balance: null },
    operationDate: "2026-03-01",
    valueDate: "2026-03-02",
    debit: null,
    credit: "500.00",
    reference: "VIR-DEMO-0001",
    status: 1,
  },
];

/** `/vat-rate` CPT : un taux normal démonstratif. */
export const VAT_RATE_CPT: Record<string, unknown>[] = [
  { designation: "Taux normal Démo", rate: "20.00", isActive: true, territoriality: "France" },
];

/** `/search-entries/entries` (tableau nu) : non utilisé par aucun des 17 outils v0.1, fourni vide. */
export const SEARCH_ENTRIES_CPT: Record<string, unknown>[] = [];
