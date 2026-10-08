import type { CodeErreur, ErreurMetier } from "../domain/errors.js";

/**
 * Erreur de stockage (fiche T04, 07 §3) : réutilise les codes existants de `CODES_ERREUR`, n'en
 * ajoute aucun. `message`/`details` ne contiennent jamais de contenu de fichier, de token, de
 * secret ni de stack — seul le chemin ou le nom de verrou est admis (07 §2 garantit qu'aucun
 * secret n'apparaît dans les noms).
 */
export class ErreurStockage extends Error {
  readonly erreur: ErreurMetier;

  constructor(erreur: ErreurMetier) {
    super(erreur.message);
    this.name = "ErreurStockage";
    this.erreur = erreur;
  }
}

function creer(
  code: CodeErreur,
  message: string,
  action: string,
  details?: Record<string, unknown>,
): ErreurStockage {
  return new ErreurStockage(
    details === undefined ? { code, message, action } : { code, message, action, details },
  );
}

export function erreurNomVerrouInvalide(nom: string): ErreurStockage {
  return creer(
    "INVALID_ARGUMENT",
    "Nom de verrou invalide.",
    "Utiliser un nom conforme à RE_IDENTIFIANT (auth, config, quota).",
    { nom },
  );
}

export function erreurPermissionRefusee(chemin: string, details?: Record<string, unknown>): ErreurStockage {
  return creer(
    "PERMISSION_DENIED",
    "Accès refusé sur le stockage local.",
    "Vérifier les permissions du répertoire de configuration.",
    { chemin, ...details },
  );
}

export function erreurStockageEchec(
  message: string,
  chemin: string,
  details?: Record<string, unknown>,
): ErreurStockage {
  return creer(
    "AUTH_STORAGE_FAILED",
    message,
    "Réessayer ; si l'échec persiste, vérifier l'espace disque et l'intégrité du fichier.",
    { chemin, ...details },
  );
}

export function erreurVersionPlusRecente(chemin: string, storeVersion: number): ErreurStockage {
  return creer(
    "AUTH_STORAGE_FAILED",
    "État écrit par une version plus récente de ebp-mcp.",
    "Mettre à jour ebp-mcp avant de réutiliser ce répertoire de configuration.",
    { chemin, storeVersion },
  );
}

export function erreurEnveloppeInvalide(chemin: string, raison: string): ErreurStockage {
  return creer(
    "AUTH_STORAGE_FAILED",
    "Enveloppe de stockage illisible ou invalide.",
    "Restaurer le fichier à partir d'une sauvegarde ou réinitialiser explicitement ce stockage.",
    { chemin, raison },
  );
}

export function erreurVerrouDeadlineDepassee(nom: string): ErreurStockage {
  return creer(
    "AUTH_STORAGE_FAILED",
    `Délai dépassé en attendant le verrou ${nom}.`,
    "Réessayer plus tard ou augmenter la deadline de l'appel.",
    { nom, raison: "deadline" },
  );
}

export function erreurVerrouAnnule(nom: string): ErreurStockage {
  return creer(
    "AUTH_STORAGE_FAILED",
    `Attente du verrou ${nom} annulée.`,
    "L'appel a été annulé ; réessayer si nécessaire.",
    { nom, raison: "signal" },
  );
}

export function erreurVerrouHoteEtranger(nom: string, hoteDistant: string): ErreurStockage {
  return creer(
    "AUTH_STORAGE_FAILED",
    `Verrou ${nom} détenu par un hôte distinct (${hoteDistant}).`,
    "NFS/multi-hôtes non pris en charge en v0.1 : exécuter ebp-mcp sur un seul hôte pour ce stockage.",
    { nom, hoteDistant },
  );
}

/** Traduit une erreur errno de FS en `ErreurStockage` (07 §3) sans jamais exposer le contenu écrit. */
export function depuisErreurFichier(erreur: unknown, chemin: string): ErreurStockage {
  const code = (erreur as NodeJS.ErrnoException | undefined)?.code;
  if (code === "EACCES" || code === "EPERM") {
    return erreurPermissionRefusee(chemin, { errno: code });
  }
  return erreurStockageEchec("Échec durable d'accès au stockage local.", chemin, {
    errno: code ?? "INCONNU",
  });
}
