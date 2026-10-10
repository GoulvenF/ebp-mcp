import type { CodeErreur, ErreurMetier } from "../../domain/errors.js";

/**
 * Erreur de l'adapter GesCom (fiche T10a, 07 §1/§5) : réutilise exclusivement les codes
 * existants de `CODES_ERREUR`, n'en ajoute aucun. `details` ne porte jamais le corps EBP brut
 * (décision 14 de T07), seulement des identifiants internes (route, segments, compteurs).
 */
export class ErreurAdapterGescom extends Error {
  readonly erreur: ErreurMetier;

  constructor(erreur: ErreurMetier) {
    super(erreur.message);
    this.name = "ErreurAdapterGescom";
    this.erreur = erreur;
  }
}

function creer(
  code: CodeErreur,
  message: string,
  action: string,
  details?: Record<string, unknown>,
): ErreurAdapterGescom {
  return new ErreurAdapterGescom(
    details === undefined ? { code, message, action } : { code, message, action, details },
  );
}

/** Corps de réponse 200 d'une forme différente de celle attendue par la route (02 §3). */
export function erreurEnveloppeInattendue(routeId: string): ErreurAdapterGescom {
  return creer(
    "UPSTREAM_SCHEMA_CHANGED",
    "Réponse GesCom de forme inattendue.",
    "Signaler ce bug ; le fournisseur a peut-être changé son schéma de réponse.",
    { route: routeId },
  );
}

/** `skip` renvoyé par le fournisseur différent du `skip` demandé (07 §5) : jamais de redémarrage silencieux. */
export function erreurPaginationInvalide(
  routeId: string,
  skipDemande: number,
  skipRenvoye: number,
): ErreurAdapterGescom {
  return creer(
    "UPSTREAM_PAGINATION_INVALID",
    "La pagination fournisseur n'a pas progressé entre deux pages.",
    "Signaler l'incident ; ne pas relancer automatiquement le même parcours.",
    { route: routeId, skipDemande, skipRenvoye },
  );
}

/** `take` hors de `[1, 100]` (02 §3 : page EBP ≤100) : refus avant toute émission réseau. */
export function erreurTakeInvalide(valeur: number): ErreurAdapterGescom {
  return creer(
    "INVALID_ARGUMENT",
    "`take` doit être un entier compris entre 1 et 100.",
    "Corriger le paramètre `take` ; aucune requête n'a été émise.",
    { take: valeur },
  );
}

/** `skip` négatif ou non entier : refus avant toute émission réseau. */
export function erreurSkipInvalide(valeur: number): ErreurAdapterGescom {
  return creer(
    "INVALID_ARGUMENT",
    "`skip` doit être un entier positif ou nul.",
    "Corriger le paramètre `skip` ; aucune requête n'a été émise.",
    { skip: valeur },
  );
}

/**
 * Capacité non supportée en v0.1 côté GC (07 §6) : refus avant réseau. `capacite` reste un slug
 * stable (identifiant interne, jamais une phrase embarquant une valeur source — contrat de
 * `details` dans ce fichier) ; `message`/`action` sont par défaut ceux de la résolution client par
 * code, à surcharger pour toute autre capacité afin de ne pas renvoyer une remédiation sans
 * rapport avec l'erreur réelle de l'appelant (revue T10b).
 */
export function erreurCapaciteNonSupportee(
  capacite: string,
  message = "Capacité non supportée en v0.1 pour Gestion Commerciale.",
  action = "Utiliser l'identifiant direct du client ; la résolution par code n'est pas supportée pour ce dossier.",
  details?: Record<string, unknown>,
): ErreurAdapterGescom {
  return creer("UNSUPPORTED_CAPABILITY", message, action, { capacite, ...details });
}
