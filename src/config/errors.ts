import type { CodeErreur, ErreurMetier } from "../domain/errors.js";

/**
 * Erreur de configuration (décision 10, 07 §7) : réutilise les codes existants de
 * `CODES_ERREUR`, n'en ajoute aucun. `message`/`details` ne contiennent jamais de secret —
 * pour une variable d'environnement invalide, on nomme la variable, jamais son contenu.
 */
export class ErreurConfig extends Error {
  readonly erreur: ErreurMetier;

  constructor(erreur: ErreurMetier) {
    super(erreur.message);
    this.name = "ErreurConfig";
    this.erreur = erreur;
  }
}

function creer(
  code: CodeErreur,
  message: string,
  action: string,
  details?: Record<string, unknown>,
): ErreurConfig {
  return new ErreurConfig(
    details === undefined ? { code, message, action } : { code, message, action, details },
  );
}

export function erreurConfigInvalide(message: string, details?: Record<string, unknown>): ErreurConfig {
  return creer(
    "CONFIG_INVALID",
    message,
    "Corriger config.json ou les variables d'environnement EBP_*.",
    details,
  );
}

export function erreurDossierRequis(environnement: string): ErreurConfig {
  return creer(
    "DOSSIER_REQUIRED",
    `Aucun dossier résolu pour l'environnement ${environnement}.`,
    "Préciser l'argument dossier, choisir un dossier de session, ou configurer defaultDossier.",
  );
}

export function erreurDossierInconnu(alias: string, environnement: string): ErreurConfig {
  return creer(
    "DOSSIER_UNKNOWN",
    `Alias de dossier inconnu pour l'environnement ${environnement}.`,
    "Vérifier l'alias ou l'ajouter à la configuration.",
    { alias },
  );
}

export function erreurFamilleInactive(famille: string): ErreurConfig {
  return creer(
    "UNSUPPORTED_CAPABILITY",
    `Famille ${famille} non activée pour ce profil.`,
    "Activer la famille dans enabledFamilies du profil.",
    { famille },
  );
}
