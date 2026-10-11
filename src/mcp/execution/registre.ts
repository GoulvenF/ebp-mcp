import { z } from "zod";
import {
  balanceComptes,
  detailEcriture,
  exercices,
  ficheTiers,
  grandLivre,
  listerEcritures,
  rechercherTiers,
  transactionsBancaires,
} from "../../services/compta/index.js";
import {
  detailDocument,
  echeancierClients,
  ficheArticle,
  listerDocumentsVenteService,
  listerReglementsService,
  rechercherArticles,
} from "../../services/gescom/index.js";
import type { ContexteService, DepsService, ResultatService } from "../../services/commun/types.js";
import type { OutilMetier } from "../../services/commun/capacites.js";
import { SCHEMAS_ENTREE_OUTILS } from "../../services/commun/entrees.js";
import {
  ArticleSchema,
  DateCivileSchema,
  DecimalStringSchema,
  DocumentVenteSchema,
  EcheanceSchema,
  EcritureSchema,
  ExerciceSchema,
  LigneBalanceSchema,
  LigneEcritureListeSchema,
  LigneGrandLivreSchema,
  ReglementSchema,
  TiersSchema,
  TransactionBancaireSchema,
} from "../../domain/schemas/index.js";
import { ClientGcSchema } from "../../domain/schemas/gescom.js";

export { SCHEMAS_ENTREE_OUTILS };

/** Signature commune des 14 services métier (D-T11-1), telle que réutilisée sans adaptation par ce lot. */
export type ServiceOutil = (
  deps: DepsService,
  ctx: ContexteService,
  entree: unknown,
) => Promise<ResultatService<unknown>>;

/**
 * Registre des 14 services métier de T11 (D-T12-3, étape 7) : `src/mcp/` sélectionne **un** service
 * ici et ne contient aucune logique métier lui-même (D-T12-1).
 */
export const REGISTRE_SERVICES: Record<OutilMetier, ServiceOutil> = {
  rechercher_tiers: rechercherTiers as ServiceOutil,
  fiche_tiers: ficheTiers as ServiceOutil,
  rechercher_articles: rechercherArticles as ServiceOutil,
  fiche_article: ficheArticle as ServiceOutil,
  lister_documents_vente: listerDocumentsVenteService as ServiceOutil,
  detail_document: detailDocument as ServiceOutil,
  echeancier_clients: echeancierClients as ServiceOutil,
  lister_reglements: listerReglementsService as ServiceOutil,
  lister_ecritures: listerEcritures as ServiceOutil,
  detail_ecriture: detailEcriture as ServiceOutil,
  transactions_bancaires: transactionsBancaires as ServiceOutil,
  balance_comptes: balanceComptes as ServiceOutil,
  grand_livre: grandLivre as ServiceOutil,
  exercices: exercices as ServiceOutil,
};

/** `EcheanceAvecRetard` (D-T11-9, gescom/echeancier.ts) : extension additive sans toucher à `domain/schemas/gescom.ts`. */
const EcheanceAvecRetardSchema = EcheanceSchema.extend({
  en_retard: z.boolean().nullable(),
  jours_retard: z.number().int().nullable(),
});

/** `DetailDocumentVente` (gescom/documents-detail.ts) : forme propre à la fiche, distincte de `DocumentVenteSchema`. */
const EcheanceDocumentDetailSchema = z.object({
  date: DateCivileSchema.nullable(),
  montant: DecimalStringSchema.nullable(),
  reste_du: DecimalStringSchema.nullable(),
  mode_paiement_id: z.string().nullable(),
});

const DetailDocumentVenteSchema = z.object({
  id: z.string(),
  type: DocumentVenteSchema.shape.type,
  statut: DocumentVenteSchema.shape.statut,
  tiers_id: z.string().nullable(),
  tiers_nom: z.string().nullable(),
  date: z.string().nullable(),
  numero: z.string().nullable(),
  montant_ht: DecimalStringSchema.nullable(),
  montant_ttc: DecimalStringSchema.nullable(),
  montant_net_ttc: DecimalStringSchema.nullable(),
  devise: z.string().nullable(),
  reste_du: DecimalStringSchema.nullable(),
  statut_comptable: DocumentVenteSchema.shape.statut_comptable,
  lignes: z.array(z.unknown()).nullable(),
  pied: z.unknown().nullable(),
  recapitulatif_tva: z.array(z.unknown()).nullable(),
  echeances: z.array(EcheanceDocumentDetailSchema).nullable(),
  date_validite: z.string().nullable(),
  montant_en_retard: DecimalStringSchema.nullable(),
});

/** `ResultatBalanceComptes` (D-T11-12, compta/balance.ts) : forme de l'unique résultat de `balance_comptes`. */
const ResultatBalanceComptesSchema = z.object({
  du: DateCivileSchema,
  au: DateCivileSchema,
  perimetre: z.object({
    classe: z.string().nullable(),
    comptes: z.array(z.string()).nullable(),
    statuts: z.string(),
  }),
  comptes: z.array(LigneBalanceSchema),
  lignes_parcourues: z.number().int().nonnegative(),
  lignes_exclues: z.number().int().nonnegative(),
  devise: z.null(),
});

/**
 * `exercices` (D-T11-16, compta/exercices.ts) : résultat unique `{exercices}`, pas un tableau
 * direct (07 §6). Exporté : réutilisé tel quel par `ebp://{dossier}/exercices`
 * (`mcp/serveur/ressources.ts`, D-T12-13) plutôt que dupliqué.
 */
export const ResultatExercicesSchema = z.object({ exercices: z.array(ExerciceSchema) });

/**
 * Schémas de sortie des 14 outils (D-T12-3, étape 8), un seul par outil, réutilisant les schémas
 * `domain/schemas/*` déjà validés par T09–T11 sans les modifier : ce lot ne touche jamais
 * `src/domain/schemas/compta.ts` ni `gescom.ts`, seulement `commun.ts` (`enveloppeSchema`).
 */
export const SCHEMAS_SORTIE_OUTILS = {
  rechercher_tiers: TiersSchema,
  fiche_tiers: z.union([TiersSchema, ClientGcSchema]),
  rechercher_articles: ArticleSchema,
  fiche_article: ArticleSchema,
  lister_documents_vente: DocumentVenteSchema,
  detail_document: DetailDocumentVenteSchema,
  echeancier_clients: EcheanceAvecRetardSchema,
  lister_reglements: ReglementSchema,
  lister_ecritures: LigneEcritureListeSchema,
  detail_ecriture: EcritureSchema,
  transactions_bancaires: TransactionBancaireSchema,
  balance_comptes: ResultatBalanceComptesSchema,
  grand_livre: LigneGrandLivreSchema,
  exercices: ResultatExercicesSchema,
} as const satisfies Record<OutilMetier, z.ZodType>;
