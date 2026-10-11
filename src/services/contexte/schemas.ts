import { z } from "zod";
import { OUTILS_METIER } from "../commun/capacites.js";

/**
 * Schémas Zod de sortie des 3 outils de contexte (D-T12-11, 07 §6), exportés pour le lot 3
 * (`src/mcp/`) qui les réutilise tels quels pour `tools/list`/validation de sortie. Ce lot ne
 * construit jamais l'enveloppe MCP finale : ces schémas décrivent l'objet unique porté par
 * `resultats[0]`, pas l'enveloppe complète.
 */

const FAMILLE = z.enum(["hubbix-compta", "hubbix-gescom"]);
const ENVIRONNEMENT = z.enum(["prod", "preprod"]);

export const OptionNonSupporteeSchema = z
  .object({
    option: z.string(),
    motif: z.string(),
    valeurs: z.array(z.string()).optional(),
  })
  .strict();

export const CapaciteOutilSchema = z
  .object({
    outil: z.enum(OUTILS_METIER),
    statut: z.enum(["disponible", "non_supportee"]),
    motif: z.string().optional(),
    optionsNonSupportees: z.array(OptionNonSupporteeSchema),
  })
  .strict();

// --- ebp_lister_dossiers ---------------------------------------------------------------------

export const DossierContexteSchema = z
  .object({
    alias: z.string(),
    famille: FAMILLE,
    id: z.string(),
    nom: z.string().nullable(),
    famille_active: z.boolean(),
    validation_live: z.literal("non_prouvee"),
    capacites: z.array(CapaciteOutilSchema),
  })
  .strict();

export const ListerDossiersContexteSchema = z
  .object({
    environnement: ENVIRONNEMENT,
    dossier_actif: z.string().nullable(),
    dossier_defaut: z.string().nullable(),
    dossiers: z.array(DossierContexteSchema),
  })
  .strict();

// --- ebp_choisir_dossier ----------------------------------------------------------------------

export const ChoisirDossierContexteEntreeSchema = z.object({ dossier: z.string().min(1) }).strict();

export const ChoisirDossierContexteSchema = z
  .object({
    dossier_actif: z.string(),
    famille: FAMILLE,
    nom: z.string().nullable(),
  })
  .strict();

// --- ebp_statut ---------------------------------------------------------------------------------

export const QuotaGroupeStatutSchema = z
  .object({
    groupe: z.string(),
    quota_jour_restant: z.number().int(),
    quota_utilisable: z.number().int(),
    quota_estime: z.boolean(),
    max_par_jour: z.number().int(),
    reserve: z.number().int(),
  })
  .strict();

/** `email` nullable (D-T12-13) : la politique PII masque `email` à `null` à toute profondeur, y compris ici. */
export const ClaimsIdTokenSchema = z
  .object({ email: z.string().nullable().optional(), nom: z.string().optional() })
  .strict();

export const DiagnosticAuthSchema = z
  .object({
    profil: z.string(),
    environnement: ENVIRONNEMENT,
    empreinteClient: z.string(),
    state: z.enum(["ready", "refreshing", "reauth_required", "absent"]),
    expiresAt: z.string().nullable(),
    refreshExpiresAtEstimate: z.string().nullable(),
    refreshEstime: z.literal(true),
    generation: z.number().int().nullable(),
    pkce: z.enum(["required", "disabled"]),
    claims: ClaimsIdTokenSchema.nullable(),
    claimsVerifies: z.literal(false),
    tentativesAuth: z.number().int(),
  })
  .strict();

export const StatutContexteSchema = z
  .object({
    profil: z.string(),
    environnement: ENVIRONNEMENT,
    mode: z.enum(["mock", "live"]),
    dossier_actif: z.string().nullable(),
    auth: DiagnosticAuthSchema,
    quota: z.array(QuotaGroupeStatutSchema),
  })
  .strict();
