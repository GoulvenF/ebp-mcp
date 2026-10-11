import type { Tool, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { enveloppeSchema } from "../../domain/schemas/commun.js";
import { OUTILS_METIER, type OutilMetier } from "../../services/commun/capacites.js";
import { SCHEMAS_ENTREE_OUTILS } from "../../services/commun/entrees.js";
import {
  ChoisirDossierContexteEntreeSchema,
  ChoisirDossierContexteSchema,
  ListerDossiersContexteSchema,
  StatutContexteSchema,
} from "../../services/contexte/schemas.js";
import { SCHEMAS_SORTIE_OUTILS } from "../execution/registre.js";

/** Les 3 outils de contexte (D-T12-11), distincts des 14 outils métier de `OUTILS_METIER`. */
export const OUTILS_CONTEXTE = ["ebp_lister_dossiers", "ebp_choisir_dossier", "ebp_statut"] as const;
export type OutilContexte = (typeof OUTILS_CONTEXTE)[number];

/** Nom complet des 17 outils v0.1 exposés par `tools/list` (D-T12-12) : aucun catalogue futur. */
export type NomOutil = OutilMetier | OutilContexte;

/** Aucune entrée spécifique (D-T12-11) : `{}` strict, toute clé inconnue est refusée avant réseau. */
export const EntreeVideSchema = z.object({}).strict();

const ANNOTATIONS_LECTURE: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

const ANNOTATIONS_CONTEXTE_LECTURE: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

/** `ebp_choisir_dossier` (D-T12-12) : mutation locale du contexte de session, aucune écriture EBP ni config. */
const ANNOTATIONS_CHOISIR_DOSSIER: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

interface DefinitionOutil {
  readonly nom: NomOutil;
  readonly title: string;
  readonly descriptionFr: string;
  readonly descriptionEn: string;
  readonly annotations: ToolAnnotations;
  readonly schemaEntree: z.ZodType;
  readonly schemaSortie: z.ZodType;
}

const DEFINITIONS_OUTILS_METIER: Record<OutilMetier, Omit<DefinitionOutil, "nom" | "schemaEntree" | "schemaSortie">> = {
  rechercher_tiers: {
    title: "Rechercher des tiers",
    descriptionFr:
      "Recherche des tiers (clients, prospects, fournisseurs) dans un dossier Comptabilité (CPT) par texte, type ou statut actif. Filtres appliqués localement sous réserve de correspondance API non prouvée ; aucun rapprochement avec un dossier Gestion Commerciale.",
    descriptionEn:
      "Searches third parties (customers, prospects, suppliers) in an Accounting (CPT) folder by text, type or active status. Filters are applied locally pending proven API support; no cross-folder matching with Sales Management.",
    annotations: ANNOTATIONS_LECTURE,
  },
  fiche_tiers: {
    title: "Fiche d'un tiers",
    descriptionFr:
      "Détail d'un tiers par `id` ou par `code` (exactement un des deux). CPT : `code` est un numéro direct, un `id` UUID est résolu par recherche bornée. GC : `id` direct uniquement, `code` non supporté en v0.1.",
    descriptionEn:
      "Detail of a third party by `id` or by `code` (exactly one). CPT: `code` is a direct number, a UUID `id` is resolved via a bounded search. GC: direct `id` only, `code` is not supported in v0.1.",
    annotations: ANNOTATIONS_LECTURE,
  },
  rechercher_articles: {
    title: "Rechercher des articles",
    descriptionFr:
      "Recherche d'articles (biens ou services) dans un dossier Gestion Commerciale (GC) par texte, type ou statut actif. `avec_stock: true` n'est pas supporté en v0.1 (capacité refusée avant réseau).",
    descriptionEn:
      "Searches items (goods or services) in a Sales Management (GC) folder by text, type or active status. `avec_stock: true` is not supported in v0.1 (capability rejected before any network call).",
    annotations: ANNOTATIONS_LECTURE,
  },
  fiche_article: {
    title: "Fiche d'un article",
    descriptionFr:
      "Détail d'un article GC par `reference: {id,type}` ou par `code` (exactement un des deux). Un `code` est résolu par liste puis détail ; le type effectif vient du résultat, jamais déduit de l'entrée.",
    descriptionEn:
      "Detail of a GC item by `reference: {id,type}` or by `code` (exactly one). A `code` is resolved via a list scan then a detail call; the effective type comes from the result, never guessed from the input.",
    annotations: ANNOTATIONS_LECTURE,
  },
  lister_documents_vente: {
    title: "Lister les documents de vente",
    descriptionFr:
      "Liste de documents de vente GC (devis, commande, facture, avoir…) filtrable par types, statut, dates et tiers (`id` exact). Les types hors catalogue v0.1 (commande, bon_livraison, bon_retour, avenant, situation, devis_etude) sont refusés avant réseau.",
    descriptionEn:
      "Lists GC sales documents (quote, order, invoice, credit note…) filterable by type, status, dates and third party (exact `id`). Types outside the v0.1 catalogue are rejected before any network call.",
    annotations: ANNOTATIONS_LECTURE,
  },
  detail_document: {
    title: "Détail d'un document de vente",
    descriptionFr:
      "Détail d'un document de vente GC, avec ses lignes par défaut (`avec_lignes: true`), par `reference: {id,type,statut}` ou par `numero` (exactement un des deux). Une référence route directement ; un numéro exige une résolution bornée et unique.",
    descriptionEn:
      "Detail of a GC sales document, with its lines by default (`avec_lignes: true`), by `reference: {id,type,statut}` or by `numero` (exactly one). A reference routes directly; a number requires a bounded, unique resolution.",
    annotations: ANNOTATIONS_LECTURE,
  },
  echeancier_clients: {
    title: "Échéancier clients",
    descriptionFr:
      "Liste des échéances de règlement de documents GC, avec `en_retard`/`jours_retard` calculés localement (aujourd'hui n'est jamais en retard). Aucune reconstitution comptable (CPT) ; pas de cumul de montants.",
    descriptionEn:
      "Lists GC document payment due dates, with `en_retard`/`jours_retard` computed locally (today is never late). No accounting (CPT) reconstruction; no amount totalling.",
    annotations: ANNOTATIONS_LECTURE,
  },
  lister_reglements: {
    title: "Lister les règlements",
    descriptionFr:
      "Liste des règlements GC filtrable par dates et affectation (`non_affectes`). `tiers` est refusé avant réseau : la source ne fournit pas d'identifiant tiers prouvé ; le nom connu est conservé en sortie, l'`id` reste `null`.",
    descriptionEn:
      "Lists GC payments filterable by dates and allocation (`non_affectes`). `tiers` is rejected before any network call: the source does not provide a proven third-party identifier; the known name is kept in the output, `id` stays `null`.",
    annotations: ANNOTATIONS_LECTURE,
  },
  lister_ecritures: {
    title: "Lister les écritures",
    descriptionFr:
      "Liste des **lignes** d'écriture CPT (pas l'écriture complète) filtrable par dates, journaux, comptes, texte, statut validé/lettré. Comptes exacts, sans préfixe implicite.",
    descriptionEn:
      "Lists CPT entry **lines** (not the full entry) filterable by dates, journals, accounts, text, validated/matched status. Exact account numbers, no implicit prefix matching.",
    annotations: ANNOTATIONS_LECTURE,
  },
  detail_ecriture: {
    title: "Détail d'une écriture",
    descriptionFr: "Détail complet d'une écriture comptable CPT (toutes ses lignes) par `id` UUID.",
    descriptionEn: "Full detail of a CPT accounting entry (all its lines) by UUID `id`.",
    annotations: ANNOTATIONS_LECTURE,
  },
  transactions_bancaires: {
    title: "Transactions bancaires",
    descriptionFr:
      "Liste des transactions bancaires CPT sur une période (`du`/`au` requis), filtrable par compte exact. `statut` n'est pas filtrable (valeurs source non prouvées) : le code source est conservé tel quel en sortie.",
    descriptionEn:
      "Lists CPT bank transactions over a period (`du`/`au` required), filterable by exact account. `statut` cannot be filtered (unproven source values): the source code is kept as-is in the output.",
    annotations: ANNOTATIONS_LECTURE,
  },
  balance_comptes: {
    title: "Balance de mouvements",
    descriptionFr:
      "Agrégat débit/crédit par compte CPT sur une période (`du`/`au` requis), par `classe` (un chiffre) ou `comptes[]` (exclusifs). Sans solde d'ouverture implicite : ce n'est pas un bilan ; pas de cumul de soldes absolus.",
    descriptionEn:
      "Debit/credit aggregate per CPT account over a period (`du`/`au` required), by `classe` (single digit) or `comptes[]` (exclusive). No implicit opening balance: this is not a balance sheet; no summing of absolute balances.",
    annotations: ANNOTATIONS_LECTURE,
  },
  grand_livre: {
    title: "Grand livre d'un compte",
    descriptionFr:
      "Liste chronologique des lignes d'un compte CPT sur une période (`du`/`au` requis). Aucun cumul prétendu depuis l'origine du compte.",
    descriptionEn:
      "Chronological list of a CPT account's lines over a period (`du`/`au` required). No claimed running total since the account's origin.",
    annotations: ANNOTATIONS_LECTURE,
  },
  exercices: {
    title: "Exercices comptables",
    descriptionFr: "Liste des exercices comptables d'un dossier CPT, issus des paramètres du dossier. Aucune entrée spécifique.",
    descriptionEn: "Lists the accounting periods of a CPT folder, from the folder's parameters. No specific input.",
    annotations: ANNOTATIONS_LECTURE,
  },
};

/** Les 17 descripteurs v0.1 (D-T12-12), FR puis `EN:`, réutilisant les schémas déjà livrés aux lots 1/2. */
export const DEFINITIONS_OUTILS: readonly DefinitionOutil[] = [
  ...OUTILS_METIER.map((nom): DefinitionOutil => {
    const base = DEFINITIONS_OUTILS_METIER[nom];
    return {
      nom,
      ...base,
      schemaEntree: SCHEMAS_ENTREE_OUTILS[nom],
      schemaSortie: enveloppeSchema(SCHEMAS_SORTIE_OUTILS[nom]),
    };
  }),
  {
    nom: "ebp_lister_dossiers",
    title: "Lister les dossiers",
    descriptionFr:
      "Liste les dossiers configurés de l'environnement actif avec leurs capacités (disponible/non_supportee et motifs) et leur statut de validation ; 0 appel réseau. `validation_live` est toujours `non_prouvee` en v0.1 (09).",
    descriptionEn:
      "Lists the configured folders of the active environment with their capabilities (available/unsupported and reasons) and validation status; 0 network call. `validation_live` is always `non_prouvee` in v0.1 (09).",
    annotations: ANNOTATIONS_CONTEXTE_LECTURE,
    schemaEntree: EntreeVideSchema,
    schemaSortie: enveloppeSchema(ListerDossiersContexteSchema),
  },
  {
    nom: "ebp_choisir_dossier",
    title: "Choisir le dossier actif",
    descriptionFr:
      "Mutation locale du contexte de session, aucune écriture EBP ni config : sélectionne le dossier actif de cette connexion MCP pour les appels suivants. Un alias inconnu renvoie `DOSSIER_UNKNOWN`, sans sélection de secours ; 0 appel réseau.",
    descriptionEn:
      "A local mutation of the session context, no EBP write nor config write: selects the active folder of this MCP connection for subsequent calls. An unknown alias returns `DOSSIER_UNKNOWN`, with no fallback selection; 0 network call.",
    annotations: ANNOTATIONS_CHOISIR_DOSSIER,
    schemaEntree: ChoisirDossierContexteEntreeSchema,
    schemaSortie: enveloppeSchema(ChoisirDossierContexteSchema),
  },
  {
    nom: "ebp_statut",
    title: "Statut du serveur",
    descriptionFr:
      "Statut local : profil, environnement, mode (mock/live), dossier actif de la session, diagnostic d'authentification estimé et quota par groupe utilisé par les familles actives ; 0 appel réseau.",
    descriptionEn:
      "Local status: profile, environment, mode (mock/live), the session's active folder, an estimated authentication diagnostic and quota per group used by the active families; 0 network call.",
    annotations: ANNOTATIONS_CONTEXTE_LECTURE,
    schemaEntree: EntreeVideSchema,
    schemaSortie: enveloppeSchema(StatutContexteSchema),
  },
];

function description(definition: DefinitionOutil): string {
  return `${definition.descriptionFr}\n\nEN: ${definition.descriptionEn}`;
}

/** `tools/list` (D-T12-2/D-T12-12) : `inputSchema`/`outputSchema` générés par `z.toJSONSchema`. */
export function construireListeOutils(): Tool[] {
  return DEFINITIONS_OUTILS.map((definition) => ({
    name: definition.nom,
    title: definition.title,
    description: description(definition),
    inputSchema: z.toJSONSchema(definition.schemaEntree) as Tool["inputSchema"],
    outputSchema: z.toJSONSchema(definition.schemaSortie) as Tool["outputSchema"],
    annotations: definition.annotations,
  }));
}

const DEFINITIONS_PAR_NOM = new Map(DEFINITIONS_OUTILS.map((definition) => [definition.nom, definition]));

export function trouverDefinitionOutil(nom: string): DefinitionOutil | undefined {
  return DEFINITIONS_PAR_NOM.get(nom as NomOutil);
}

export function estOutilMetier(nom: string): nom is OutilMetier {
  return (OUTILS_METIER as readonly string[]).includes(nom);
}

export function estOutilContexte(nom: string): nom is OutilContexte {
  return (OUTILS_CONTEXTE as readonly string[]).includes(nom);
}
