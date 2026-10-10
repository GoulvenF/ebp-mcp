import { capacitesCompta } from "../../adapters/compta/capacites.js";
import type { Famille } from "../../domain/capabilities.js";
import { erreurCapaciteNonSupporteeService, erreurFamilleIncompatible } from "./erreurs.js";

/** Les 14 outils métier de 07 §6 (hors `ebp_lister_dossiers`/`ebp_choisir_dossier`/`ebp_statut`, T12). */
export const OUTILS_METIER = [
  "rechercher_tiers",
  "fiche_tiers",
  "rechercher_articles",
  "fiche_article",
  "lister_documents_vente",
  "detail_document",
  "echeancier_clients",
  "lister_reglements",
  "lister_ecritures",
  "detail_ecriture",
  "transactions_bancaires",
  "balance_comptes",
  "grand_livre",
  "exercices",
] as const;

export type OutilMetier = (typeof OUTILS_METIER)[number];

/**
 * Familles acceptées par outil (07 §6) : `fiche_tiers` est le seul outil disponible sur les deux.
 * Exportée pour rester la seule source de vérité, réutilisée telle quelle par `exigerFamilleOutil`
 * (`commun/types.ts`) plutôt que dupliquée par chaque appelant.
 */
export const FAMILLES_OUTIL: Record<OutilMetier, readonly Famille[]> = {
  rechercher_tiers: ["hubbix-compta"],
  fiche_tiers: ["hubbix-compta", "hubbix-gescom"],
  rechercher_articles: ["hubbix-gescom"],
  fiche_article: ["hubbix-gescom"],
  lister_documents_vente: ["hubbix-gescom"],
  detail_document: ["hubbix-gescom"],
  echeancier_clients: ["hubbix-gescom"],
  lister_reglements: ["hubbix-gescom"],
  lister_ecritures: ["hubbix-compta"],
  detail_ecriture: ["hubbix-compta"],
  transactions_bancaires: ["hubbix-compta"],
  balance_comptes: ["hubbix-compta"],
  grand_livre: ["hubbix-compta"],
  exercices: ["hubbix-compta"],
};

/** Une option refusée avant réseau pour un outil, dans une famille donnée (D-T11-6). */
export interface OptionNonSupportee {
  readonly option: string;
  readonly motif: string;
  /** Valeurs syntaxiques concernées quand seule une partie de l'énumération est visée. */
  readonly valeurs?: readonly string[];
}

export interface CapaciteOutil {
  readonly outil: OutilMetier;
  readonly statut: "disponible" | "non_supportee";
  /** Motif du refus **de l'outil entier** dans cette famille (famille incompatible, A03). */
  readonly motif?: string;
  readonly optionsNonSupportees: readonly OptionNonSupportee[];
}

/** Capacités déjà déclarées par l'adapter CPT (T09), indexées par nom : ce lot réutilise leurs motifs tels quels. */
const CAPACITES_COMPTA_PAR_NOM = new Map(capacitesCompta().map((capacite) => [capacite.nom, capacite]));

function motifCapaciteCompta(nom: string): string {
  const capacite = CAPACITES_COMPTA_PAR_NOM.get(nom);
  if (capacite?.motif === undefined) {
    throw new Error(`Capacité Compta inconnue ou sans motif réutilisée par le manifeste de services : ${nom}`);
  }
  return capacite.motif;
}

const MOTIF_TYPE_TIERS = "Valeurs de `types` des comptes auxiliaires non prouvées (E07) ; type source conservé en sortie.";
const MOTIF_CODE_TIERS_GC = "`fiche_tiers.code` non supporté sur un dossier GesCom en v0.1 (07 §6) ; utiliser `id`.";
const MOTIF_AVEC_STOCK = "`rechercher_articles.avec_stock: true` non supporté en v0.1 (07 §6).";
const MOTIF_TYPES_DOCUMENT =
  "Types de document non livrés en v0.1 (catalogue cible v1, 07 §6) : commande, bon_livraison, bon_retour, avenant, situation, devis_etude.";
const MOTIF_TIERS_REGLEMENTS = "`lister_reglements.tiers` refusé : la source ne fournit pas d'identifiant tiers prouvé (07 §6).";
/** Réutilise le motif déjà déclaré par l'adapter CPT pour `filtre_statut_bancaire` (T09), ne le redéfinit pas. */
const MOTIF_STATUT_BANCAIRE = motifCapaciteCompta("filtre_statut_bancaire");
/** Réutilise le motif déjà déclaré par l'adapter CPT pour `echeancier_cpt` (T09, A03), ne le redéfinit pas. */
const MOTIF_ECHEANCIER_CPT = motifCapaciteCompta("echeancier_cpt");

const TYPES_DOCUMENT_NON_SUPPORTES = [
  "commande",
  "bon_livraison",
  "bon_retour",
  "avenant",
  "situation",
  "devis_etude",
] as const;

/**
 * Options non supportées par outil (D-T11-6), indépendantes de la famille sauf mention contraire.
 * Aucun CA, aucun total d'acomptes, aucun rapprochement inter-dossiers ou inter-familles (A01, A04)
 * : ces capacités n'existent nulle part dans ce manifeste, jamais implicitement « disponibles ».
 */
function optionsNonSupportees(outil: OutilMetier, famille: Famille): OptionNonSupportee[] {
  switch (outil) {
    case "rechercher_tiers":
      return [{ option: "type", motif: MOTIF_TYPE_TIERS }];
    case "fiche_tiers":
      return famille === "hubbix-gescom" ? [{ option: "code", motif: MOTIF_CODE_TIERS_GC }] : [];
    case "rechercher_articles":
      return [{ option: "avec_stock", motif: MOTIF_AVEC_STOCK, valeurs: ["true"] }];
    case "lister_documents_vente":
      return [{ option: "types", motif: MOTIF_TYPES_DOCUMENT, valeurs: TYPES_DOCUMENT_NON_SUPPORTES }];
    case "detail_document":
      return [{ option: "reference.type", motif: MOTIF_TYPES_DOCUMENT, valeurs: TYPES_DOCUMENT_NON_SUPPORTES }];
    case "lister_reglements":
      return [{ option: "tiers", motif: MOTIF_TIERS_REGLEMENTS }];
    case "transactions_bancaires":
      return [{ option: "statut", motif: MOTIF_STATUT_BANCAIRE }];
    default:
      return [];
  }
}

/**
 * Manifeste des capacités (D-T11-6, 07 §6), données pures, 0 réseau : pour chacun des 14 outils,
 * statut dans cette famille et options refusées avant réseau. Réutilise `capacitesCompta()`
 * (fiche T09) pour les motifs CPT déjà déclarés (ex. `echeancier_cpt`, `ca_cpt`), ne les
 * redéfinit pas.
 */
export function manifesteCapacites(famille: Famille): CapaciteOutil[] {
  return OUTILS_METIER.map((outil) => {
    const famillesAcceptees = FAMILLES_OUTIL[outil];
    if (!famillesAcceptees.includes(famille)) {
      const motifFamilleIncompatible =
        outil === "echeancier_clients" && famille === "hubbix-compta"
          ? MOTIF_ECHEANCIER_CPT
          : `Outil réservé à ${famillesAcceptees.join(" ou ")} (A03) ; dossier de famille \`${famille}\`.`;
      return {
        outil,
        statut: "non_supportee",
        motif: motifFamilleIncompatible,
        optionsNonSupportees: [],
      };
    }
    return {
      outil,
      statut: "disponible",
      optionsNonSupportees: optionsNonSupportees(outil, famille),
    };
  });
}

/** Lit `entree[chemin]`, `chemin` pouvant être un chemin imbriqué séparé par `.` (ex. `reference.type`). */
function lireChemin(entree: Record<string, unknown>, chemin: string): unknown {
  return chemin.split(".").reduce<unknown>((valeur, segment) => {
    if (valeur === undefined || valeur === null || typeof valeur !== "object") {
      return undefined;
    }
    return (valeur as Record<string, unknown>)[segment];
  }, entree);
}

function trouverCapacite(famille: Famille, outil: OutilMetier): CapaciteOutil {
  const capacite = manifesteCapacites(famille).find((c) => c.outil === outil);
  if (capacite === undefined) {
    throw new Error(`Outil inconnu du manifeste de capacités : ${outil}`);
  }
  return capacite;
}

/**
 * Refuse avant tout réseau (D-T11-6) : outil indisponible dans cette famille, ou option demandée
 * non supportée par le manifeste. `entree` est l'objet déjà validé par le schéma Zod strict de
 * l'outil (07 §6) : un refus de capacité n'est jamais une erreur de schéma, la valeur est
 * syntaxiquement valide, le refus vient uniquement du manifeste.
 */
export function verifierCapacitesEntree(outil: OutilMetier, famille: Famille, entree: Record<string, unknown>): void {
  const capacite = trouverCapacite(famille, outil);
  if (capacite.statut === "non_supportee") {
    throw erreurFamilleIncompatible(outil, famille, FAMILLES_OUTIL[outil]);
  }

  for (const option of capacite.optionsNonSupportees) {
    const valeur = lireChemin(entree, option.option);
    if (valeur === undefined) {
      continue;
    }
    if (option.valeurs !== undefined) {
      const valeurs = Array.isArray(valeur) ? valeur : [valeur];
      const concernee = valeurs.some((v) => option.valeurs?.includes(String(v)));
      if (!concernee) {
        continue;
      }
    } else if (valeur === false) {
      // Une option booléenne absente ou `false` n'implique jamais un filtre caché (07 §6).
      continue;
    }
    throw erreurCapaciteNonSupporteeService(outil, option.option, option.motif, valeur);
  }
}
