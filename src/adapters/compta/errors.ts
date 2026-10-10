import type { CodeErreur, ErreurMetier } from "../../domain/errors.js";

/**
 * Erreur de l'adapter Comptabilité (fiche T09, 07 §1/§5) : réutilise exclusivement les codes
 * existants de `CODES_ERREUR`, n'en ajoute aucun. `details` ne porte jamais le corps EBP brut
 * (décision 14 de T07), seulement des identifiants internes (route, segments, compteurs). Même
 * style que `src/adapters/hubbix-gescom/errors.ts` (T10a), classe distincte par adapter.
 */
export class ErreurAdapterCompta extends Error {
  readonly erreur: ErreurMetier;

  constructor(erreur: ErreurMetier) {
    super(erreur.message);
    this.name = "ErreurAdapterCompta";
    this.erreur = erreur;
  }
}

function creer(
  code: CodeErreur,
  message: string,
  action: string,
  details?: Record<string, unknown>,
): ErreurAdapterCompta {
  return new ErreurAdapterCompta(
    details === undefined ? { code, message, action } : { code, message, action, details },
  );
}

/**
 * Corps 200 d'une forme différente de celle attendue par la route (02 §2, D-T09-7) : un wrapper
 * par route, reconnu structurellement. `linesEntries` ne se lit jamais comme `data`, un tableau nu
 * ne se lit jamais comme `data` — ce cas, et non une relecture sous une autre forme, lève cette
 * erreur.
 */
export function erreurEnveloppeInattendueCompta(routeId: string): ErreurAdapterCompta {
  return creer(
    "UPSTREAM_SCHEMA_CHANGED",
    "Réponse Comptabilité de forme inattendue.",
    "Signaler ce bug ; le fournisseur a peut-être changé son schéma de réponse.",
    { route: routeId },
  );
}

/** `take` hors de `[1, 100]` (D-T09-4, 02 §2 : page EBP ≤100) : refus avant toute émission réseau. */
export function erreurTakeInvalideCompta(valeur: number): ErreurAdapterCompta {
  return creer(
    "INVALID_ARGUMENT",
    "`take` doit être un entier compris entre 1 et 100.",
    "Corriger le paramètre `take` ; aucune requête n'a été émise.",
    { take: valeur },
  );
}

/** `skip` négatif ou non entier : refus avant toute émission réseau. */
export function erreurSkipInvalideCompta(valeur: number): ErreurAdapterCompta {
  return creer(
    "INVALID_ARGUMENT",
    "`skip` doit être un entier positif ou nul.",
    "Corriger le paramètre `skip` ; aucune requête n'a été émise.",
    { skip: valeur },
  );
}

/**
 * Capacité non supportée en v0.1 côté CPT (D-T09-5, 07 §6) : filtre non documenté/non prouvé
 * demandé par l'appelant ⇒ refus avant tout appel réseau, jamais une tentative de filtre local
 * silencieux ni un paramètre conjectural envoyé à EBP.
 */
export function erreurCapaciteNonSupporteeCompta(capacite: string): ErreurAdapterCompta {
  return creer(
    "UNSUPPORTED_CAPABILITY",
    "Capacité non supportée en v0.1 pour Comptabilité.",
    "Retirer ce filtre ; cette capacité n'est pas disponible sur ce dossier.",
    { capacite },
  );
}
