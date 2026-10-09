import { z } from "zod";
import { DateCivileSchema, ErreurMetierSchema, PaginationSchema } from "../domain/index.js";

/** Familles livrées en v0.1 (07 §1) ; les familles SaaS restent hors corpus exécutable. */
export const FAMILLES_FIXTURE = ["hubbix-compta", "hubbix-gescom"] as const;
export type FamilleFixture = (typeof FAMILLES_FIXTURE)[number];

/**
 * Les trois formes de wrapper documentées par 02, le tableau nu, le cas d'échec, et `fiche`
 * (objet nu sans enveloppe de liste : détail article, fiche client — ajouté en T10a pour les
 * routes `/customers/{id}`, `/items/goods|services/{id}`, jamais renommé ni retiré depuis).
 */
export const FORMES_ENVELOPPE = ["data", "elements", "linesEntries", "tableau_nu", "erreur", "fiche"] as const;
export type FormeEnveloppe = (typeof FORMES_ENVELOPPE)[number];

export const STATUTS_FIXTURE = ["synthetique", "documente", "observe"] as const;
export type StatutFixture = (typeof STATUTS_FIXTURE)[number];

/** Ensemble fermé des marqueurs de couverture exigés par la fiche T03b. */
export const MARQUEURS_COUVERTURE = [
  "enveloppe-data",
  "enveloppe-elements",
  "enveloppe-lines-entries",
  "enveloppe-tableau-nu",
  "erreur-fournisseur",
  "page-vide",
  "champs-null",
  "enum-inconnu",
  "compte-zeros",
  "decimal-precision",
  "avoir-negatif",
  "fenetre-un-jour",
  "pagination-invalide",
] as const;
export type MarqueurCouverture = (typeof MARQUEURS_COUVERTURE)[number];

const ID_FIXTURE = /^[a-z][a-z0-9]*(-[a-z0-9]+)+$/;
const CHEMIN_ROUTE = /^\/[\w-]+(\/[\w{}.-]+)*(\?[\w=&-]*)?$/;
const IDENTIFIANT_PREUVE = /^E\d{2}$/;

const SourceFixtureSchema = z
  .object({
    url: z
      .string()
      .url()
      .refine((url) => url.startsWith("https://developpeurs-storage.ebp.com"), {
        message: "La source doit pointer sur https://developpeurs-storage.ebp.com",
      }),
    section: z.string().min(1),
    consulte_le: DateCivileSchema,
  })
  .strict();

const RequeteAttendueSchema = z
  .object({
    methode: z.literal("GET"),
    chemin: z.string().regex(CHEMIN_ROUTE, "Chemin EBP invalide"),
    parametres: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  })
  .strict();

const ReponseEbpSchema = z
  .object({
    statut_http: z.number().int().min(100).max(599),
    corps: z.unknown(),
  })
  .strict();

const AttentesSchema = z
  .object({
    description: z.string().min(1),
    resultats: z.array(z.record(z.string(), z.unknown())),
    pagination: PaginationSchema.nullable(),
    avertissements: z.array(z.string()),
    erreur: ErreurMetierSchema.nullable(),
  })
  .strict();

/** Manifeste d'une fixture du corpus (`tests/corpus/ebp/*.json`), 07 §5/§8, A01/A02/A10/A26. */
export const ManifesteFixtureSchema = z
  .object({
    id: z.string().regex(ID_FIXTURE, "Identifiant de fixture invalide (kebab-case attendu)"),
    famille: z.enum(FAMILLES_FIXTURE),
    route: z.string().regex(CHEMIN_ROUTE, "Chemin EBP invalide"),
    forme_enveloppe: z.enum(FORMES_ENVELOPPE),
    source: SourceFixtureSchema,
    statut: z.enum(STATUTS_FIXTURE),
    observe_le: DateCivileSchema.nullable(),
    preuves_liees: z.array(z.string().regex(IDENTIFIANT_PREUVE, "Identifiant de preuve invalide")),
    couverture: z.array(z.enum(MARQUEURS_COUVERTURE)).min(1),
    requete_attendue: RequeteAttendueSchema,
    reponse_ebp: ReponseEbpSchema,
    attentes: AttentesSchema,
    notes: z.string().optional(),
  })
  .strict()
  .refine((manifeste) => manifeste.statut !== "observe" || manifeste.observe_le !== null, {
    message: "Une fixture `observe` exige `observe_le` non nul (07 §5)",
    path: ["observe_le"],
  });

export type ManifesteFixture = z.infer<typeof ManifesteFixtureSchema>;

/**
 * Détermine la forme réelle de `reponse_ebp.corps` par inspection structurelle (02 §1 : trois
 * wrappers + tableau nu). Ne fait jamais confiance à `forme_enveloppe` déclaré.
 */
export function determinerFormeEnveloppeReelle(corps: unknown): FormeEnveloppe | null {
  if (Array.isArray(corps)) {
    return "tableau_nu";
  }
  if (typeof corps !== "object" || corps === null) {
    return null;
  }
  const objet = corps as Record<string, unknown>;
  if (Array.isArray(objet.linesEntries)) {
    return "linesEntries";
  }
  if (Array.isArray(objet.data) && "totalRecords" in objet) {
    return "data";
  }
  if (Array.isArray(objet.elements) && "total" in objet) {
    return "elements";
  }
  if (typeof objet.status === "number" && typeof objet.errorCode === "string") {
    return "erreur";
  }
  if (typeof objet.title === "string" && Array.isArray(objet.errors)) {
    return "erreur";
  }
  return "fiche";
}
