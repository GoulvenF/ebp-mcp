import type { CodeErreur, ErreurMetier } from "../domain/errors.js";

/**
 * Erreur du client HTTP (fiche T07, 07 §4) : réutilise exclusivement les codes existants de
 * `CODES_ERREUR`. `details` ne porte jamais que `{ route, statut }` (et `raison` quand elle
 * existe) : le corps d'erreur EBP n'est jamais réémis, même tronqué (décision 14).
 */
export class ErreurHttp extends Error {
  readonly erreur: ErreurMetier;

  constructor(erreur: ErreurMetier) {
    super(erreur.message);
    this.name = "ErreurHttp";
    this.erreur = erreur;
  }
}

function creer(
  code: CodeErreur,
  message: string,
  action: string,
  details?: Record<string, unknown>,
): ErreurHttp {
  return new ErreurHttp(
    details === undefined ? { code, message, action } : { code, message, action, details },
  );
}

/** Garde du client refusée avant tout réseau (route inconnue, méthode, segment, paramètre, hôte). */
export function erreurGuardRefuse(message: string, details?: Record<string, unknown>): ErreurHttp {
  return creer("INVALID_ARGUMENT", message, "Corriger l'appel ; aucune requête n'a été émise.", details);
}

export function erreurRouteInconnue(routeId: string): ErreurHttp {
  return erreurGuardRefuse("Route non déclarée dans le registre.", { route: routeId });
}

export function erreurMethodeRefusee(routeId: string, methode: string): ErreurHttp {
  return erreurGuardRefuse("Méthode refusée (lecture seule).", { route: routeId, methode });
}

/** `hote` est un libellé interne (jamais une URL/query complète) : aucune donnée sensible à logguer. */
export function erreurHoteNonAutorise(routeId: string | null, hote: string): ErreurHttp {
  return erreurGuardRefuse("Hôte hors de la liste blanche.", { route: routeId, hote });
}

export function erreurSegmentManquant(routeId: string, segment: string): ErreurHttp {
  return erreurGuardRefuse("Segment de chemin manquant.", { route: routeId, segment });
}

export function erreurSegmentInvalide(routeId: string, segment: string): ErreurHttp {
  return erreurGuardRefuse("Segment de chemin invalide.", { route: routeId, segment });
}

export function erreurParametreNonDeclare(routeId: string, parametre: string): ErreurHttp {
  return erreurGuardRefuse("Paramètre non déclaré pour cette route.", { route: routeId, parametre });
}

/** 400 EBP (décision 14). */
export function erreurArgumentInvalideEbp(routeId: string, statut: number): ErreurHttp {
  return creer(
    "INVALID_ARGUMENT",
    "Paramètre refusé par EBP.",
    "Corriger les paramètres de l'appel.",
    { route: routeId, statut },
  );
}

/** 401 après le rejeu unique épuisé (décision 12). */
export function erreurAuthRequiseHttp(routeId: string, statut: number): ErreurHttp {
  return creer(
    "AUTH_REQUIRED",
    "Authentification requise ou expirée.",
    "Relancer une authentification (login) puis réessayer.",
    { route: routeId, statut },
  );
}

/** 403 : jamais de refresh ni de retry (décision 13). */
export function erreurPermissionRefuseeHttp(routeId: string, statut: number): ErreurHttp {
  return creer(
    "PERMISSION_DENIED",
    "Droits insuffisants pour cet appel.",
    "Vérifier les droits de l'abonnement ou du compte EBP utilisé.",
    { route: routeId, statut },
  );
}

/** 404 EBP. */
export function erreurNonTrouveHttp(routeId: string, statut: number): ErreurHttp {
  return creer(
    "NOT_FOUND",
    "Ressource introuvable.",
    "Vérifier l'identifiant utilisé.",
    { route: routeId, statut },
  );
}

/** 3xx (jamais suivi), 5xx hors retry, réseau ou retries épuisés (décision 14). */
export function erreurUpstreamIndisponible(routeId: string, statut: number | null): ErreurHttp {
  return creer(
    "UPSTREAM_UNAVAILABLE",
    "Service EBP indisponible ou réponse inattendue.",
    "Réessayer plus tard.",
    statut === null ? { route: routeId } : { route: routeId, statut },
  );
}

/** JSON malformé ou `Content-Type` non JSON (décision 14). */
export function erreurSchemaInattendu(routeId: string, statut: number): ErreurHttp {
  return creer(
    "UPSTREAM_SCHEMA_CHANGED",
    "Réponse EBP illisible ou de forme inattendue.",
    "Signaler ce bug ; le fournisseur a peut-être changé son schéma de réponse.",
    { route: routeId, statut },
  );
}

/** > 5 Mio (décision 14/15). */
export function erreurReponseTropVolumineuse(routeId: string | null): ErreurHttp {
  return creer(
    "RESPONSE_TOO_LARGE",
    "Réponse EBP trop volumineuse.",
    "Réduire le périmètre de la demande.",
    { route: routeId },
  );
}

/** Budget/deadline/annulation épuisés avant émission (décision 9/17, même sémantique que T05). */
export function erreurBudgetEpuiseHttp(routeId: string): ErreurHttp {
  return creer(
    "RESOLUTION_INCOMPLETE",
    "Budget de tentatives épuisé avant l'émission.",
    "Réessayer l'appel avec un budget suffisant.",
    { route: routeId, raison: "budget" },
  );
}

export function erreurDeadlineDepasseeHttp(routeId: string): ErreurHttp {
  return creer(
    "RESOLUTION_INCOMPLETE",
    "Deadline dépassée avant l'émission.",
    "Réessayer l'appel avec une deadline suffisante.",
    { route: routeId, raison: "deadline" },
  );
}

export function erreurAnnuleHttp(routeId: string): ErreurHttp {
  return creer(
    "RESOLUTION_INCOMPLETE",
    "Appel annulé ; aucune requête supplémentaire n'a été émise.",
    "Réessayer si nécessaire.",
    { route: routeId, raison: "annule" },
  );
}
