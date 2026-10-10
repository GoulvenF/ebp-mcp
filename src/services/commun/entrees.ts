import { z } from "zod";
import { joursCivilsEntre } from "../../domain/date.js";
import { CompteSchema, DateCivileSchema, UuidSchema } from "../../domain/schemas/commun.js";
import { erreurArgumentInvalideService } from "./erreurs.js";

/**
 * Schémas d'entrée stricts des 14 outils métier de 07 §6 (D-T11-1). Clés inconnues toujours
 * rejetées (`.strict()`). Les refus de capacités (D-T11-6) ne sont jamais des erreurs de schéma :
 * une valeur ici syntaxiquement valide peut être refusée plus loin par `verifierCapacitesEntree`.
 * Réutilisés tels quels par T12 pour `tools/list`.
 */

const DossierOptionnel = z.string().min(1).optional();
const InclureBrutDefaut = z.boolean().default(false);
const LimiteDefaut = z.number().int().min(1).max(500).default(50);
const CurseurOptionnel = z.string().min(1).optional();
/**
 * Texte non vide ni blanc quand fourni (D-T11-4) : rejeté **au niveau du schéma** (`INVALID_ARGUMENT`,
 * 0 appel réseau), pas seulement par `correspondTexte` appelé plus tard dans le filtre du scan —
 * sinon une entrée blanche déclencherait déjà une lecture de page avant le refus.
 */
const TexteOptionnel = z
  .string()
  .min(1)
  .refine((valeur) => valeur.trim().length > 0, { message: "`texte` ne peut pas être composé uniquement d'espaces." })
  .optional();
const IdentifiantOptionnel = z.string().min(1).optional();

const champsListe = {
  dossier: DossierOptionnel,
  inclure_brut: InclureBrutDefaut,
  limite: LimiteDefaut,
  curseur: CurseurOptionnel,
};

const champsFiche = {
  dossier: DossierOptionnel,
  inclure_brut: InclureBrutDefaut,
};

/** Exactement une des clés de `cles` doit être définie (D-T11-3/D-T11-15, ex. `id`/`code`). */
function exigerExactementUn<K extends string>(cles: readonly K[]) {
  return (data: Partial<Record<K, unknown>>, ctx: z.RefinementCtx): void => {
    const presentes = cles.filter((cle) => data[cle] !== undefined);
    if (presentes.length !== 1) {
      ctx.addIssue({
        code: "custom",
        message: `Exactement un de ${cles.map((c) => `\`${c}\``).join(" ou ")} est requis.`,
      });
    }
  };
}

/** Au plus une des clés de `cles` peut être définie (D-T11-11, ex. `classe`/`comptes`). */
function exigerAuPlusUn<K extends string>(cles: readonly K[]) {
  return (data: Partial<Record<K, unknown>>, ctx: z.RefinementCtx): void => {
    const presentes = cles.filter((cle) => data[cle] !== undefined);
    if (presentes.length > 1) {
      ctx.addIssue({
        code: "custom",
        message: `\`${cles.join("\`/\`")}\` sont exclusifs : au plus un à la fois.`,
      });
    }
  };
}

/** `du <= au` quand les deux sont fournis (07 §5) ; dates déjà validées individuellement par `DateCivileSchema`. */
function exigerOrdreDates(data: { du?: string | undefined; au?: string | undefined }, ctx: z.RefinementCtx): void {
  if (data.du !== undefined && data.au !== undefined && joursCivilsEntre(data.du, data.au) < 0) {
    ctx.addIssue({
      code: "custom",
      message: `\`du\` (${data.du}) est postérieur à \`au\` (${data.au}).`,
      path: ["au"],
    });
  }
}

/** Valide `valeur` contre `schema` et traduit un échec Zod en `ErreurService` `INVALID_ARGUMENT` (07 §4). */
export function validerEntree<T extends z.ZodType>(schema: T, valeur: unknown, outil: string): z.infer<T> {
  const resultat = schema.safeParse(valeur);
  if (!resultat.success) {
    throw erreurArgumentInvalideService(`Entrée invalide pour \`${outil}\`.`, {
      outil,
      issues: resultat.error.issues.map((issue) => ({ chemin: issue.path.join("."), message: issue.message })),
    });
  }
  return resultat.data as z.infer<T>;
}

// --- 1. rechercher_tiers (CPT) -------------------------------------------------------------

export const RechercherTiersEntreeSchema = z
  .object({
    ...champsListe,
    texte: TexteOptionnel,
    type: z.enum(["client", "prospect", "fournisseur"]).optional(),
    actif: z.boolean().optional(),
  })
  .strict();

// --- 2. fiche_tiers (CPT + GC) --------------------------------------------------------------

export const FicheTiersEntreeSchema = z
  .object({
    ...champsFiche,
    id: IdentifiantOptionnel,
    code: IdentifiantOptionnel,
  })
  .strict()
  .superRefine(exigerExactementUn(["id", "code"]));

// --- 3. rechercher_articles (GC) ------------------------------------------------------------

export const RechercherArticlesEntreeSchema = z
  .object({
    ...champsListe,
    texte: TexteOptionnel,
    type: z.enum(["bien", "service"]).optional(),
    actif: z.boolean().optional(),
    avec_stock: z.boolean().default(false),
  })
  .strict();

// --- 4. fiche_article (GC) ------------------------------------------------------------------

export const FicheArticleEntreeSchema = z
  .object({
    ...champsFiche,
    reference: z
      .object({ id: z.string().min(1), type: z.enum(["bien", "service"]) })
      .strict()
      .optional(),
    code: IdentifiantOptionnel,
  })
  .strict()
  .superRefine(exigerExactementUn(["reference", "code"]));

// --- 5. lister_documents_vente (GC) ----------------------------------------------------------

/**
 * Valeurs syntaxiquement valides de `types` (D-T11-6) : les cinq premières correspondent aux
 * types normalisés de `DocumentVenteSchema` (07 §6) ; les six suivantes sont des types du
 * catalogue cible v1 (04) refusés comme capacité non supportée par `verifierCapacitesEntree`,
 * jamais par ce schéma.
 */
export const TypeDocumentVenteEntreeSchema = z.enum([
  "facture",
  "avoir",
  "facture_acompte",
  "avoir_acompte",
  "devis",
  "commande",
  "bon_livraison",
  "bon_retour",
  "avenant",
  "situation",
  "devis_etude",
]);

/**
 * Combinaisons type/statut contradictoires (D-T11-7) : `statut: "facture"` n'a de sens que pour
 * un `devis` (le seul type dont le statut source `1` se nomme `facture` plutôt que `valide`) ; sans
 * `types` fourni, le type `inconnu` reste inclus et aucune combinaison n'est jugée contradictoire.
 */
function exigerCoherenceTypeStatutDocuments(
  data: { types?: string[] | undefined; statut?: string | undefined },
  ctx: z.RefinementCtx,
): void {
  if (data.types === undefined || data.statut === undefined) {
    return;
  }
  const contientDevis = data.types.includes("devis");
  if (data.statut === "facture" && !contientDevis) {
    ctx.addIssue({
      code: "custom",
      message: "`statut: \"facture\"` n'est valide que pour `types` contenant `devis`.",
      path: ["statut"],
    });
  }
  if (data.statut === "valide" && contientDevis && data.types.every((t) => t === "devis")) {
    ctx.addIssue({
      code: "custom",
      message: "`statut: \"valide\"` n'est pas valide pour `types: [\"devis\"]` seul (un devis n'a pas de statut `valide`).",
      path: ["statut"],
    });
  }
}

export const ListerDocumentsVenteEntreeSchema = z
  .object({
    ...champsListe,
    types: z.array(TypeDocumentVenteEntreeSchema).optional(),
    statut: z.enum(["provisoire", "valide", "facture"]).optional(),
    du: DateCivileSchema.optional(),
    au: DateCivileSchema.optional(),
    tiers: IdentifiantOptionnel,
    texte: TexteOptionnel,
  })
  .strict()
  .superRefine(exigerOrdreDates)
  .superRefine(exigerCoherenceTypeStatutDocuments);

// --- 6. detail_document (GC) -----------------------------------------------------------------

/** `{type: devis, statut: valide}` et `{type ≠ devis, statut: facture}` sont contradictoires (D-T11-7). */
function exigerCoherenceReferenceDocument(
  data: { reference?: { type: string; statut: string } | undefined },
  ctx: z.RefinementCtx,
): void {
  if (data.reference === undefined) {
    return;
  }
  const { type, statut } = data.reference;
  if (type === "devis" && statut === "valide") {
    ctx.addIssue({
      code: "custom",
      message: "`reference.statut: \"valide\"` n'est pas valide pour `reference.type: \"devis\"` (un devis n'a pas de statut `valide`).",
      path: ["reference", "statut"],
    });
  }
  if (type !== "devis" && statut === "facture") {
    ctx.addIssue({
      code: "custom",
      message: "`reference.statut: \"facture\"` n'est valide que pour `reference.type: \"devis\"`.",
      path: ["reference", "statut"],
    });
  }
}

export const DetailDocumentEntreeSchema = z
  .object({
    ...champsFiche,
    reference: z
      .object({
        id: z.string().min(1),
        type: TypeDocumentVenteEntreeSchema,
        statut: z.enum(["provisoire", "valide", "facture"]),
      })
      .strict()
      .optional(),
    numero: IdentifiantOptionnel,
    avec_lignes: z.boolean().default(true),
  })
  .strict()
  .superRefine(exigerExactementUn(["reference", "numero"]))
  .superRefine(exigerCoherenceReferenceDocument);

// --- 7. echeancier_clients (GC) ---------------------------------------------------------------

export const EcheancierClientsEntreeSchema = z
  .object({
    ...champsListe,
    du: DateCivileSchema.optional(),
    au: DateCivileSchema.optional(),
    tiers: IdentifiantOptionnel,
    en_retard_seulement: z.boolean().default(false),
  })
  .strict()
  .superRefine(exigerOrdreDates);

// --- 8. lister_reglements (GC) -----------------------------------------------------------------

export const ListerReglementsEntreeSchema = z
  .object({
    ...champsListe,
    du: DateCivileSchema.optional(),
    au: DateCivileSchema.optional(),
    tiers: IdentifiantOptionnel,
    non_affectes: z.boolean().default(false),
  })
  .strict()
  .superRefine(exigerOrdreDates);

// --- 9. lister_ecritures (CPT) -----------------------------------------------------------------

export const ListerEcrituresEntreeSchema = z
  .object({
    ...champsListe,
    du: DateCivileSchema.optional(),
    au: DateCivileSchema.optional(),
    journaux: z.array(z.string().min(1)).optional(),
    compte: CompteSchema.optional(),
    compte_tiers: CompteSchema.optional(),
    texte: TexteOptionnel,
    validees: z.boolean().optional(),
    lettrees: z.boolean().optional(),
  })
  .strict()
  .superRefine(exigerOrdreDates);

// --- 10. detail_ecriture (CPT) -------------------------------------------------------------------

export const DetailEcritureEntreeSchema = z
  .object({
    ...champsFiche,
    id: UuidSchema,
  })
  .strict();

// --- 11. transactions_bancaires (CPT) -------------------------------------------------------------

export const TransactionsBancairesEntreeSchema = z
  .object({
    ...champsListe,
    du: DateCivileSchema,
    au: DateCivileSchema,
    compte: CompteSchema.optional(),
    /** Valeur source conservée, jamais interprétée (D-T11-6) : toujours refusée par le manifeste quand fournie. */
    statut: z.string().min(1).optional(),
  })
  .strict()
  .superRefine(exigerOrdreDates);

// --- 12. balance_comptes (CPT, agrégat : pas de limite/curseur, 07 §5) -----------------------------

export const BalanceComptesEntreeSchema = z
  .object({
    ...champsFiche,
    du: DateCivileSchema,
    au: DateCivileSchema,
    classe: z
      .string()
      .regex(/^[1-9]$/, "`classe` doit être un chiffre unique (1-9).")
      .optional(),
    comptes: z
      .array(z.string().min(1))
      .min(1)
      .max(100)
      .refine((valeurs) => new Set(valeurs).size === valeurs.length, {
        message: "`comptes` ne doit pas contenir de doublons.",
      })
      .optional(),
  })
  .strict()
  .superRefine(exigerOrdreDates)
  .superRefine(exigerAuPlusUn(["classe", "comptes"]));

// --- 13. grand_livre (CPT) --------------------------------------------------------------------------

export const GrandLivreEntreeSchema = z
  .object({
    ...champsListe,
    compte: CompteSchema,
    du: DateCivileSchema,
    au: DateCivileSchema,
  })
  .strict()
  .superRefine(exigerOrdreDates);

// --- 14. exercices (CPT, aucune entrée spécifique) --------------------------------------------------

export const ExercicesEntreeSchema = z.object({ ...champsFiche }).strict();

/** Table de correspondance outil → schéma, réutilisée telle quelle par T12 pour `tools/list`. */
export const SCHEMAS_ENTREE_OUTILS = {
  rechercher_tiers: RechercherTiersEntreeSchema,
  fiche_tiers: FicheTiersEntreeSchema,
  rechercher_articles: RechercherArticlesEntreeSchema,
  fiche_article: FicheArticleEntreeSchema,
  lister_documents_vente: ListerDocumentsVenteEntreeSchema,
  detail_document: DetailDocumentEntreeSchema,
  echeancier_clients: EcheancierClientsEntreeSchema,
  lister_reglements: ListerReglementsEntreeSchema,
  lister_ecritures: ListerEcrituresEntreeSchema,
  detail_ecriture: DetailEcritureEntreeSchema,
  transactions_bancaires: TransactionsBancairesEntreeSchema,
  balance_comptes: BalanceComptesEntreeSchema,
  grand_livre: GrandLivreEntreeSchema,
  exercices: ExercicesEntreeSchema,
} as const;
