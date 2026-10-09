import type { CodeErreur, ErreurMetier } from "../domain/errors.js";

/**
 * Erreur du module auth (fiche T06, 07 §3) : réutilise exclusivement les codes existants de
 * `CODES_ERREUR`. `message`/`details` ne contiennent jamais de token, de `client_secret`, de
 * `subscriptionKey` ni de `clientId` en clair, et jamais de fragment brut d'`error_description`
 * OAuth (assaini en amont par l'appelant).
 */
export class ErreurAuth extends Error {
  readonly erreur: ErreurMetier;

  constructor(erreur: ErreurMetier) {
    super(erreur.message);
    this.name = "ErreurAuth";
    this.erreur = erreur;
  }
}

function creer(
  code: CodeErreur,
  message: string,
  action: string,
  details?: Record<string, unknown>,
): ErreurAuth {
  return new ErreurAuth(
    details === undefined ? { code, message, action } : { code, message, action, details },
  );
}

/** Réauthentification nécessaire : token absent, révoqué, rotation indéterminée ou abandonnée. */
export function erreurAuthRequise(
  message: string,
  action: string,
  details?: Record<string, unknown>,
): ErreurAuth {
  return creer("AUTH_REQUIRED", message, action, details);
}

/** Configuration invalide détectée à l'exécution (ex. port de callback occupé). */
export function erreurAuthConfigInvalide(
  message: string,
  action: string,
  details?: Record<string, unknown>,
): ErreurAuth {
  return creer("CONFIG_INVALID", message, action, details);
}

/** Argument interne invalide (ex. URL hors de l'hôte identité autorisé). */
export function erreurArgumentInvalide(
  message: string,
  action: string,
  details?: Record<string, unknown>,
): ErreurAuth {
  return creer("INVALID_ARGUMENT", message, action, details);
}
