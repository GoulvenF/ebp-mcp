import { z } from "zod";
import { isValidDecimalString } from "../decimal.js";
import { estDateCivile } from "../date.js";
import { estCompte, estUuid } from "../identifiant.js";
import { CODES_ERREUR } from "../errors.js";
import type { ErreurMetier } from "../errors.js";
import type { Enveloppe, Meta, Pagination } from "../envelope.js";

/** Chaîne décimale canonique validée par `isValidDecimalString` (07 §5). */
export const DecimalStringSchema = z.string().refine(isValidDecimalString, {
  message: "Chaîne décimale invalide",
});

/** `YYYY-MM-DD` strictement calendaire (07 §5). */
export const DateCivileSchema = z.string().refine(estDateCivile, {
  message: "Date civile invalide",
});

/** Numéro de compte conservé tel quel, sans normalisation (A26). */
export const CompteSchema = z.string().refine(estCompte, {
  message: "Numéro de compte invalide",
});

/** RFC 4122, insensible à la casse, non normalisé. */
export const UuidSchema = z.string().refine(estUuid, {
  message: "UUID invalide",
});

export const PaginationSchema = z.object({
  renvoyes: z.number().int(),
  total: z.number().int().nullable(),
  total_source: z.number().int().nullable(),
  hasMore: z.boolean(),
  curseur: z.string().nullable(),
});

export const MetaSchema = z.object({
  appels_api: z.number().int(),
  appels_auth: z.number().int(),
  duree_ms: z.number(),
  quota_jour_restant: z.number().int().nullable(),
  quota_utilisable: z.number().int().nullable(),
  quota_estime: z.boolean().nullable(),
  approximatif: z.boolean(),
  completude: z.enum(["complete", "page", "partielle"]),
  raison_arret: z.enum(["limite", "budget", "quota", "deadline", "source_incomplete", "cursor_capacity"]).nullable(),
  sources: z.array(z.string()),
  avertissements: z.array(z.string()),
  mode: z.enum(["mock", "live"]),
  observe_a: z.string(),
});

export const ErreurMetierSchema = z.object({
  code: z.enum(CODES_ERREUR),
  message: z.string(),
  action: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
});

/** Enveloppe métier commune (07 §5) : `dossier: null` pour les outils de contexte globaux. */
export function enveloppeSchema<T extends z.ZodType>(resultat: T) {
  return z.object({
    dossier: z.string().nullable(),
    resultats: z.array(resultat),
    pagination: PaginationSchema.nullable(),
    meta: MetaSchema,
  });
}

// Contrôle d'alignement schéma ↔ interface T01 (assignabilité dans les deux sens). Ce bloc n'est
// jamais exécuté : une divergence se manifeste uniquement comme une erreur de typecheck.
type VerifieAssignabiliteBidirectionnelle<A, B> = A extends B ? (B extends A ? true : never) : never;

type _PaginationAlignee = VerifieAssignabiliteBidirectionnelle<z.infer<typeof PaginationSchema>, Pagination>;
type _MetaAlignee = VerifieAssignabiliteBidirectionnelle<z.infer<typeof MetaSchema>, Meta>;
type _ErreurMetierAlignee = VerifieAssignabiliteBidirectionnelle<z.infer<typeof ErreurMetierSchema>, ErreurMetier>;
type _EnveloppeAlignee = VerifieAssignabiliteBidirectionnelle<
  z.infer<ReturnType<typeof enveloppeSchema<z.ZodUnknown>>>,
  Enveloppe<unknown>
>;

// Les types ci-dessus ne sont jamais instanciés : seule leur présence force le typecheck à les
// évaluer. `satisfies` interdit un `never` silencieux si une divergence apparaît.
export type _ControleAlignementSchemas = [
  _PaginationAlignee,
  _MetaAlignee,
  _ErreurMetierAlignee,
  _EnveloppeAlignee,
] extends [true, true, true, true]
  ? true
  : never;

const _controleAlignementSchemas: _ControleAlignementSchemas = true;
void _controleAlignementSchemas;
