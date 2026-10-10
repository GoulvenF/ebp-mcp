import type { CodeErreur, ErreurMetier } from "../../domain/errors.js";

/**
 * Erreur commune des services métier (fiche T11, 07 §1/§5/§6) : réutilise exclusivement les 19
 * codes existants de `CODES_ERREUR`, n'en ajoute aucun. Même style que `ErreurPagination`
 * (`src/pagination/errors.ts`) et `ErreurAdapterCompta`/`ErreurAdapterGescom`.
 */
export class ErreurService extends Error {
  readonly erreur: ErreurMetier;

  constructor(erreur: ErreurMetier) {
    super(erreur.message);
    this.name = "ErreurService";
    this.erreur = erreur;
  }
}

function creer(
  code: CodeErreur,
  message: string,
  action: string,
  details?: Record<string, unknown>,
): ErreurService {
  return new ErreurService(
    details === undefined ? { code, message, action } : { code, message, action, details },
  );
}

/** Entrée syntaxiquement invalide (schéma Zod strict) : 0 appel réseau (07 §4, ordre de validation). */
export function erreurArgumentInvalideService(message: string, details?: Record<string, unknown>): ErreurService {
  return creer(
    "INVALID_ARGUMENT",
    message,
    "Corriger l'entrée avant de relancer l'appel ; aucune requête n'a été émise.",
    details,
  );
}

/**
 * Famille de l'outil incompatible avec celle du dossier/du dossier avec celle de `ContexteHttp`
 * (D-T11-1) : refus avant tout réseau, jamais une tentative silencieuse sur l'autre famille.
 */
export function erreurFamilleIncompatible(
  outil: string,
  familleDossier: string,
  famillesAttendues: readonly string[],
): ErreurService {
  return creer(
    "UNSUPPORTED_CAPABILITY",
    `L'outil \`${outil}\` n'est pas disponible pour un dossier de la famille \`${familleDossier}\`.`,
    "Utiliser un dossier de la famille attendue, ou un autre outil.",
    { outil, famille_dossier: familleDossier, familles_attendues: famillesAttendues },
  );
}

/** Capacité ou option non supportée en v0.1, refusée avant tout réseau (D-T11-6). */
export function erreurCapaciteNonSupporteeService(
  outil: string,
  option: string,
  motif: string,
  valeur?: unknown,
): ErreurService {
  return creer(
    "UNSUPPORTED_CAPABILITY",
    `Option \`${option}\` de \`${outil}\` non supportée en v0.1.`,
    "Retirer cette option ; consulter le manifeste de capacités pour le motif détaillé.",
    valeur === undefined ? { outil, option, motif } : { outil, option, motif, valeur },
  );
}

/** Aucune correspondance après un scan complet (D-T11-3) : jamais confondu avec un scan interrompu. */
export function erreurNonTrouve(details?: Record<string, unknown>): ErreurService {
  return creer(
    "NOT_FOUND",
    "Aucun élément ne correspond exactement à cette référence.",
    "Vérifier la valeur transmise ; aucune correction automatique n'est appliquée.",
    details,
  );
}

/** Deux correspondances exactes ou plus trouvées pour une référence censée être unique (D-T11-3). */
export function erreurReferenceAmbigue(details?: Record<string, unknown>): ErreurService {
  return creer(
    "AMBIGUOUS_REFERENCE",
    "Plusieurs éléments correspondent exactement à cette référence.",
    "Fournir un identifiant plus précis (ex. UUID plutôt que code).",
    details,
  );
}

/**
 * Scan interrompu avant d'avoir pu conclure (budget/quota/deadline/source incomplète), même avec
 * un seul candidat déjà trouvé (D-T11-3) : jamais confondu avec `NOT_FOUND` ni un succès.
 */
export function erreurResolutionIncomplete(
  raison: "budget" | "quota" | "deadline" | "source_incomplete" | null,
  details?: Record<string, unknown>,
): ErreurService {
  return creer(
    "RESOLUTION_INCOMPLETE",
    "La résolution de cette référence n'a pas pu être menée à son terme.",
    "Relancer l'appel ; réduire le périmètre si l'interruption persiste.",
    { raison, ...details },
  );
}

/** `correspondTexte` avec un texte vide ou uniquement composé d'espaces (D-T11-4). */
export function erreurTexteVide(): ErreurService {
  return creer(
    "INVALID_ARGUMENT",
    "`texte` ne peut pas être vide ou composé uniquement d'espaces.",
    "Fournir un texte de recherche non vide.",
  );
}
