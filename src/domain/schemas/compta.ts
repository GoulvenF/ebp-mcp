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

/** Agrégat de balance par compte (07 §8) : `solde = debit − credit`. */
export const LigneBalanceSchema = z.object({
  compte: CompteSchema,
  debit: DecimalStringSchema,
  credit: DecimalStringSchema,
  solde: DecimalStringSchema,
  solde_debiteur: DecimalStringSchema,
  solde_crediteur: DecimalStringSchema,
  devise: z.string().nullable(),
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
