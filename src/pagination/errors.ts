import type { CodeErreur, ErreurMetier } from "../domain/errors.js";

/**
 * Erreur du module pagination (fiche T08, 07 §5) : réutilise exclusivement les codes existants
 * de `CODES_ERREUR`, n'en ajoute aucun.
 */
export class ErreurPagination extends Error {
  readonly erreur: ErreurMetier;

  constructor(erreur: ErreurMetier) {
    super(erreur.message);
    this.name = "ErreurPagination";
    this.erreur = erreur;
  }
}

function creer(
  code: CodeErreur,
  message: string,
  action: string,
  details?: Record<string, unknown>,
): ErreurPagination {
  return new ErreurPagination(
    details === undefined ? { code, message, action } : { code, message, action, details },
  );
}

/** `limite` hors 1..500 (07 §5) : refusé avant tout appel source. */
export function erreurLimiteInvalide(limite: unknown): ErreurPagination {
  return creer(
    "INVALID_ARGUMENT",
    "`limite` doit être un entier compris entre 1 et 500.",
    "Corriger `limite` avant de relancer l'appel ; aucune requête source n'a été émise.",
    { limite },
  );
}

/**
 * Position inchangée d'une page à la suivante, ou page répétée (même ensemble d'`idElement`)
 * (07 §5) : erreur, jamais un résultat partiel.
 */
export function erreurPaginationUpstreamInvalide(
  sourceId: string,
  raison: "position_inchangee" | "page_repetee",
): ErreurPagination {
  return creer(
    "UPSTREAM_PAGINATION_INVALID",
    "La source distante n'a pas progressé entre deux pages.",
    "Signaler ce bug ; la pagination de cette route n'est plus fiable.",
    { source: sourceId, raison },
  );
}

/** État absent, expiré, évincé ou perdu au redémarrage (07 §5). */
export function erreurCurseurExpire(): ErreurPagination {
  return creer(
    "CURSOR_EXPIRED",
    "Curseur absent, expiré ou évincé.",
    "Recommencer le parcours depuis le début, sans curseur.",
  );
}

/** Reprise avec une identité divergente : dossier, filtres, tri, limite ou outil différents (07 §5). */
export function erreurCurseurMismatch(): ErreurPagination {
  return creer(
    "CURSOR_MISMATCH",
    "Le curseur ne correspond pas à l'appel courant (dossier, filtres, tri, limite ou outil différents).",
    "Recommencer le parcours avec les mêmes paramètres, ou sans curseur.",
  );
}

/** Consommation concurrente du même curseur (07 §5) : un seul consommateur à la fois. */
export function erreurCurseurBusy(): ErreurPagination {
  return creer(
    "CURSOR_BUSY",
    "Ce curseur est déjà en cours de consommation par un autre appel.",
    "Attendre la fin de l'appel en cours avant de réessayer.",
  );
}

/**
 * Annulation (`signal`) avant ou pendant un appel source (07 §4/§5) : arrêt sans nouvelle
 * tentative. Code `RESOLUTION_INCOMPLETE` avec `details.raison: "annule"`, délibérément hors des
 * raisons converties en résultat partiel (`budget`/`quota`/`deadline`) : propagée comme erreur.
 */
export function erreurScanAnnule(): ErreurPagination {
  return creer(
    "RESOLUTION_INCOMPLETE",
    "Parcours annulé ; aucune requête supplémentaire n'a été émise.",
    "Réessayer si nécessaire.",
    { raison: "annule" },
  );
}
