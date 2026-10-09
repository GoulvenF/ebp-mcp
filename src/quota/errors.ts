import type { CodeErreur, ErreurMetier } from "../domain/errors.js";

/**
 * Erreur d'admission quota (fiche T05, 07 §4) : réutilise les codes existants de
 * `CODES_ERREUR`, n'en ajoute aucun. `message`/`details` ne contiennent jamais de secret, seul
 * le nom du groupe (déjà un `Identifiant`, 07 §2) est admis.
 */
export class ErreurQuota extends Error {
  readonly erreur: ErreurMetier;

  constructor(erreur: ErreurMetier) {
    super(erreur.message);
    this.name = "ErreurQuota";
    this.erreur = erreur;
  }
}

function creer(
  code: CodeErreur,
  message: string,
  action: string,
  details?: Record<string, unknown>,
): ErreurQuota {
  return new ErreurQuota(
    details === undefined ? { code, message, action } : { code, message, action, details },
  );
}

/** Nom de groupe qui n'est pas un `Identifiant` validé (07 §2) ; défense en profondeur de T05. */
export function erreurGroupeInvalide(groupe: string): ErreurQuota {
  return creer(
    "INVALID_ARGUMENT",
    "Nom de groupe de quota invalide.",
    "Utiliser un identifiant conforme (07 §2) déjà déclaré dans quotaGroups.",
    { groupe },
  );
}

/** Groupe syntaxiquement valide mais absent de la configuration résolue (défense en profondeur). */
export function erreurGroupeInconnu(groupe: string): ErreurQuota {
  return creer(
    "CONFIG_INVALID",
    `Groupe de quota "${groupe}" non déclaré.`,
    "Déclarer le groupe dans quotaGroups de config.json.",
    { groupe },
  );
}

/**
 * Réserve journalière du groupe atteinte (07 §4) : aucun départ supplémentaire, sans
 * incrémenter ni attendre. Même bucket que les autres arrêts attendus de 07 §5 (`raison_arret`).
 */
export function erreurReserveAtteinte(groupe: string): ErreurQuota {
  return creer(
    "RESOLUTION_INCOMPLETE",
    `Réserve de quota atteinte pour le groupe "${groupe}".`,
    "Réessayer après le rollover du jour civil du groupe, ou augmenter maxPerDay/reserve.",
    { groupe, raison: "quota" },
  );
}

/**
 * Budget/deadline insuffisant pour attendre le prochain créneau (A12, 07 §4) : couvre aussi le
 * cas `Retry-After` supérieur à `deadline`. Rejet immédiat, sans attente mesurable ni réservation.
 */
export function erreurDeadlineInsuffisante(groupe: string): ErreurQuota {
  return creer(
    "RESOLUTION_INCOMPLETE",
    `Deadline insuffisante pour admettre un départ sur le groupe "${groupe}".`,
    "Réessayer avec une deadline plus large, ou retenter l'appel plus tard.",
    { groupe, raison: "deadline" },
  );
}

/** Annulation pendant l'attente d'un créneau (07 §4) : aucune réservation, aucune nouvelle tentative. */
export function erreurQuotaAnnule(groupe: string): ErreurQuota {
  return creer(
    "RESOLUTION_INCOMPLETE",
    `Attente d'un départ sur le groupe "${groupe}" annulée.`,
    "L'appel a été annulé ; réessayer si nécessaire.",
    { groupe, raison: "annule" },
  );
}
