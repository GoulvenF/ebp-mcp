import { z } from "zod";

/**
 * Schémas EBP bruts (02 §2), distincts des schémas de domaine (`src/domain/schemas/compta.ts`).
 * Champs exactement ceux documentés ; aucun champ conjectural. Un montant peut être une chaîne
 * (lexème décimal) ou un nombre JSON (D-T09-3) : `z.union` plutôt qu'un seul type, la décision du
 * mapping se fait dans `lignes.ts`, jamais ici. Validés avant tout mapping : un champ documenté
 * manquant ou de type différent fait échouer le `safeParse`, déclenchant `UPSTREAM_SCHEMA_CHANGED`
 * côté appelant plutôt qu'une valeur inventée.
 */

const MontantEbp = z.union([z.string(), z.number()]).nullable();

/** `/domain-information` (02 §2) : fiche sans wrapper. */
export const DomainInformationEbpSchema = z.object({
  domainName: z.string().nullable(),
  domainCode: z.string().nullable(),
  version: z.string().nullable(),
});

/** Élément de `exercices[]` dans `/folder-settings` (02 §2). */
const ExerciceEbpSchema = z.object({
  startDate: z.string(),
  endDate: z.string(),
  exerciceNumber: z.number().int().nullable(),
  closingDate: z.string().nullable(),
});

/**
 * `/folder-settings` (02 §2) : fiche sans wrapper. Seul `entry.mode` a un chemin documenté avec
 * exactitude au-delà de `exercices[]` — « longueurs de comptes » et « types de tiers » ne sont que
 * de la prose sans nom de champ vérifiable (T09), donc absents de ce schéma.
 */
export const FolderSettingsEbpSchema = z.object({
  exercices: z.array(ExerciceEbpSchema),
  entry: z.object({ mode: z.string().nullable() }).nullable().optional(),
});

/**
 * `/auxiliary-account-types` (02 §2, prose uniquement — aucun échantillon JSON documenté) :
 * supposition raisonnable `{data:[{code, collectiveAccount}]}`, alignée sur le même wrapper que
 * les autres référentiels CPT (`/journals`, `/general-account`, `/vat-rate`) ; forme non prouvée,
 * à vérifier en préprod (E07). `code` ∈ {C, F, S, O, A} (Clients/Fournisseurs/Salariés/
 * Organismes/Autres), `collectiveAccount` le compte collectif associé (411/401/421/437/467).
 */
export const AuxiliaryAccountTypeEbpSchema = z.object({
  code: z.string().nullable(),
  collectiveAccount: z.string().nullable(),
});

/** Élément de `/auxiliary-accounts` (02 §2). */
export const AuxiliaryAccountEbpSchema = z.object({
  uuid: z.string(),
  name: z.string().nullable(),
  number: z.string(),
  vatNumber: z.string().nullable(),
  siret: z.string().nullable(),
  isActive: z.boolean().nullable(),
  types: z.array(z.string()).nullable(),
});

/** Fiche `/auxiliary-accounts/{number}` (02 §2) : liste + `contact{email}`, `address{…}`. */
export const AuxiliaryAccountDetailEbpSchema = AuxiliaryAccountEbpSchema.extend({
  contact: z.object({ email: z.string().nullable() }).nullable().optional(),
});

/** Élément de `/general-account` (02 §2) : `{data:[{uuid,number,label,active,collective,racine}]}`. */
export const GeneralAccountEbpSchema = z.object({
  uuid: z.string().nullable(),
  number: z.string(),
  label: z.string().nullable(),
  active: z.boolean().nullable(),
  collective: z.boolean().nullable(),
  racine: z.boolean().nullable(),
});

/** Élément de `/journals` (02 §2) : `{data:[{uuid,code,name,journalType{name},counterpartAccount}]}`. */
export const JournalEbpSchema = z.object({
  uuid: z.string().nullable(),
  code: z.string(),
  name: z.string().nullable(),
  journalType: z.object({ name: z.string().nullable() }).nullable().optional(),
  counterpartAccount: z.string().nullable().optional(),
});

/** Élément source de `entry{journal,date,entryMode}` dans `/lines-entries` (02 §2). */
const EntryEnveloppeEbpSchema = z.object({
  journal: z.string().nullable(),
  date: z.string().nullable(),
  entryMode: z.string().nullable(),
});

/** Élément de `/lines-entries` (02 §2) : wrapper `linesEntries`. */
export const LinesEntryEbpSchema = z.object({
  entry: EntryEnveloppeEbpSchema,
  generalAccount: z.string().nullable(),
  auxiliaryAccount: z.string().nullable(),
  label: z.string().nullable(),
  debit: MontantEbp,
  credit: MontantEbp,
  piece: z.string().nullable(),
  document: z.string().nullable().optional(),
  deadline: z.string().nullable(),
  lettering: z.string().nullable(),
});

/** Ligne de `/entries/{uuid}` → `lines[]` (02 §2) : pas de sous-objet `entry`, déjà porté par la fiche. */
const EntryLineEbpSchema = z.object({
  generalAccount: z.string().nullable(),
  auxiliaryAccount: z.string().nullable(),
  label: z.string().nullable(),
  debit: MontantEbp,
  credit: MontantEbp,
  piece: z.string().nullable(),
  document: z.string().nullable().optional(),
  deadline: z.string().nullable(),
  lettering: z.string().nullable(),
});

/** Fiche `/entries/{uuid}` (02 §2) : « écriture complète avec `lines[]` ». */
export const EntryDetailEbpSchema = z.object({
  uuid: z.string().nullable().optional(),
  journal: z.string().nullable(),
  date: z.string(),
  entryMode: z.string().nullable(),
  lines: z.array(EntryLineEbpSchema),
});

/** Élément du tableau nu `/search-entries/entries` (02 §2) : comptes courts, `thirdAccount`. */
export const SearchEntriesLineEbpSchema = z.object({
  generalAccount: z.string().nullable(),
  thirdAccount: z.string().nullable(),
  label: z.string().nullable(),
  debit: MontantEbp,
  credit: MontantEbp,
  piece: z.string().nullable(),
  deadline: z.string().nullable(),
  lettering: z.string().nullable(),
});

/** Sous-objet `account` de `/bank-transactions` (02 §2). */
const BankTransactionAccountEbpSchema = z.object({
  bankName: z.string().nullable().optional(),
  iban: z.string().nullable().optional(),
  balance: MontantEbp.optional(),
});

/** Élément de `/bank-transactions` (02 §2). */
export const BankTransactionEbpSchema = z.object({
  label: z.string().nullable(),
  account: BankTransactionAccountEbpSchema.nullable().optional(),
  operationDate: z.string().nullable(),
  valueDate: z.string().nullable(),
  debit: MontantEbp,
  credit: MontantEbp,
  reference: z.string().nullable(),
  status: z.union([z.number(), z.string()]).nullable().optional(),
});

/** Élément de `/vat-rate` CPT (02 §2) : `{data:[{designation, rate, isActive, territoriality}]}`. */
export const VatRateEbpSchema = z.object({
  designation: z.string().nullable(),
  rate: MontantEbp,
  isActive: z.boolean().nullable(),
  territoriality: z.union([z.number(), z.string()]).nullable().optional(),
});
