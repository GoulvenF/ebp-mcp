import { z } from "zod";
import { CompteSchema, DateCivileSchema, DecimalStringSchema, UuidSchema } from "./commun.js";

/** Tiers CPT (`/auxiliary-accounts`, 02 §2) ; champ non documenté = `nullable()`. */
export const TiersSchema = z.object({
  id: UuidSchema,
  compte: CompteSchema,
  nom: z.string(),
  // `/auxiliary-accounts` : `types` (catégories Client/Fournisseur/Salarié/Organisme/Autre).
  types: z.array(z.string()).nullable(),
  numero_tva: z.string().nullable(),
  siret: z.string().nullable(),
  actif: z.boolean().nullable(),
  // `/auxiliary-accounts/{number}` : `contact.email`, non documenté par la liste.
  email: z.string().nullable(),
  telephone: z.string().nullable(),
});

/**
 * Ligne d'une écriture CPT (`/entries/{uuid}`, A26 : `id` distinct de `ecriture_id`).
 * Pas de `devise` : 02 ne documente aucun champ devise à ce niveau (écritures du dossier,
 * devise de tenue unique, non multi-devise dans le périmètre v0.1).
 */
export const LigneEcritureSchema = z.object({
  id: z.string(),
  ecriture_id: z.string(),
  compte_general: CompteSchema.nullable(),
  compte_tiers: CompteSchema.nullable(),
  libelle: z.string().nullable(),
  debit: DecimalStringSchema.nullable(),
  credit: DecimalStringSchema.nullable(),
  piece: z.string().nullable(),
  echeance: DateCivileSchema.nullable(),
  lettrage: z.string().nullable(),
});

/**
 * Ligne issue d'une route de **liste** (`/lines-entries`, `/search-entries/entries`) — D-T09-1 (T09).
 * Distinct de `LigneEcritureSchema` : ni l'une ni l'autre de ces deux routes ne documente l'UUID
 * d'écriture (02 §2) ; `ecriture_id` reste `null` ici, jamais un identifiant fabriqué. `id` est un
 * identifiant **local** dérivé du contenu de la ligne (D-T09-2, voir `src/adapters/compta/lignes.ts`),
 * non une identité EBP, non réutilisable pour relire la ligne chez EBP. `journal`/`date`/`mode`
 * proviennent de `entry{journal,date,entryMode}` sur `/lines-entries` uniquement ; `null` sur
 * `/search-entries/entries`, qui ne documente pas ces champs.
 */
export const LigneEcritureListeSchema = z.object({
  id: z.string(),
  ecriture_id: z.string().nullable(),
  journal: z.string().nullable(),
  date: DateCivileSchema.nullable(),
  mode: z.enum(["provisoire", "valide", "inconnu"]).nullable(),
  compte_general: CompteSchema.nullable(),
  compte_tiers: CompteSchema.nullable(),
  libelle: z.string().nullable(),
  debit: DecimalStringSchema.nullable(),
  credit: DecimalStringSchema.nullable(),
  piece: z.string().nullable(),
  document: z.string().nullable(),
  echeance: DateCivileSchema.nullable(),
  lettrage: z.string().nullable(),
});

/** Écriture complète (`/entries/{uuid}`, 02 §2). */
export const EcritureSchema = z.object({
  id: z.string(),
  journal: z.string().nullable(),
  date: DateCivileSchema,
  mode: z.enum(["provisoire", "valide", "inconnu"]),
  lignes: z.array(LigneEcritureSchema),
});

/**
 * `/bank-transactions` (02 §2). `status` source documenté 🟡 (0/1/2), hors de la liste
 * d'énumérations ✅ (preuve E07, T15) : `statut` reste `"inconnu"` sans conversion tant que le
 * mapping 0/1/2 n'est pas prouvé (07 §6, A26), et `statut_source` conserve le code brut.
 * Pas de `devise` : 02 ne documente aucun champ devise pour les transactions bancaires.
 */
export const TransactionBancaireSchema = z.object({
  id: z.string().nullable(),
  libelle: z.string().nullable(),
  compte_bancaire: z.string().nullable(),
  date_operation: DateCivileSchema.nullable(),
  date_valeur: DateCivileSchema.nullable(),
  debit: DecimalStringSchema.nullable(),
  credit: DecimalStringSchema.nullable(),
  reference: z.string().nullable(),
  statut: z.enum(["rapproche", "non_rapproche", "inconnu"]).nullable(),
  statut_source: z.string().nullable(),
});

/**
 * Agrégat de balance par compte (07 §8) : `solde = debit − credit`. Extension additive D-T11-12 :
 * `lignes` = nombre de lignes de mouvement parcourues pour ce compte (jamais une donnée EBP
 * séparée, dérivée du parcours local) ; `incomplet: true` quand le parcours d'agrégat qui a
 * produit cette ligne s'est arrêté avant la fin de la source (budget/quota/deadline/source
 * incomplète) — le solde affiché n'est alors jamais déclaré exhaustif (07 §5).
 */
export const LigneBalanceSchema = z.object({
  compte: CompteSchema,
  debit: DecimalStringSchema,
  credit: DecimalStringSchema,
  solde: DecimalStringSchema,
  solde_debiteur: DecimalStringSchema,
  solde_crediteur: DecimalStringSchema,
  devise: z.string().nullable(),
  lignes: z.number().int().nonnegative(),
  incomplet: z.boolean(),
});

/** Ligne de grand livre d'un compte (07 §6 `grand_livre`). Pas de `devise` : même motif que `LigneEcritureSchema`. */
export const LigneGrandLivreSchema = z.object({
  id: z.string(),
  compte: CompteSchema,
  date: DateCivileSchema,
  journal: z.string().nullable(),
  libelle: z.string().nullable(),
  piece: z.string().nullable(),
  debit: DecimalStringSchema.nullable(),
  credit: DecimalStringSchema.nullable(),
  lettrage: z.string().nullable(),
});

/** `/folder-settings` → `exercices[]` (02 §2). */
export const ExerciceSchema = z.object({
  numero: z.number().int().nullable(),
  date_debut: DateCivileSchema,
  date_fin: DateCivileSchema,
  date_cloture: DateCivileSchema.nullable(),
});

/** `/domain-information` (02 §2) : `{domainName, domainCode, version}`, ne liste pas les dossiers. */
export const InformationDomaineSchema = z.object({
  nom: z.string().nullable(),
  code: z.string().nullable(),
  version: z.string().nullable(),
});

/**
 * `/folder-settings` (02 §2) : seuls `exercices[]` et `entry.mode` ont un chemin de champ
 * exact dans la documentation ; « longueurs de comptes » et « types de tiers » n'y sont décrits
 * qu'en prose, sans nom de champ JSON vérifiable — non mappés ici plutôt qu'inventés (T09).
 */
export const ParametresDossierSchema = z.object({
  exercices: z.array(ExerciceSchema),
  mode_saisie: z.enum(["provisoire", "valide", "inconnu"]).nullable(),
});

/**
 * `/auxiliary-account-types` (02 §2, prose uniquement : « Clients C/411, Fournisseurs F/401,
 * Salariés S/421, Organismes O/437, Autres A/467 ») : forme normalisée conservant le code et le
 * compte collectif source, jamais déduits d'un préfixe de compte (D-T09-6).
 */
export const TypeCompteAuxiliaireSchema = z.object({
  code: z.enum(["C", "F", "S", "O", "A", "inconnu"]),
  code_source: z.string().nullable(),
  compte_collectif: CompteSchema.nullable(),
});

/** `/general-account` (02 §2) : `{data:[{uuid,number,label,active,collective,racine}]}`. */
export const CompteGeneralSchema = z.object({
  id: z.string().nullable(),
  numero: CompteSchema,
  libelle: z.string().nullable(),
  actif: z.boolean().nullable(),
  collectif: z.boolean().nullable(),
  racine: z.boolean().nullable(),
});

/**
 * `/journals` (02 §2) : `{data:[{uuid,code,name,journalType{name},counterpartAccount…}]}`.
 * `type` normalisé (D-T09-6) ; `type_source` conserve `journalType.name` tel que reçu, même
 * quand `type` est reconnu.
 */
export const JournalSchema = z.object({
  id: z.string().nullable(),
  code: z.string(),
  nom: z.string().nullable(),
  type: z.enum(["achats", "ventes", "tresorerie", "operations_diverses", "a_nouveaux", "inconnu"]).nullable(),
  type_source: z.string().nullable(),
  compte_contrepartie: CompteSchema.nullable(),
});

/** `/vat-rate` CPT (02 §2) : `{data:[{designation, rate, isActive, territoriality}]}`. */
export const TauxTvaCptSchema = z.object({
  designation: z.string().nullable(),
  taux: DecimalStringSchema.nullable(),
  actif: z.boolean().nullable(),
  territorialite: z.string().nullable(),
});
