import { CODES_ERREUR, type CodeErreur, type ErreurMetier } from "../../domain/errors.js";
import { appliquerPolitiqueSortie, type PolitiqueSortie } from "./politique-pii.js";

/** Erreur du module sortie (T12, 07 §5/§7) : réutilise exclusivement les codes existants de `CODES_ERREUR`. */
export class ErreurSortie extends Error {
  readonly erreur: ErreurMetier;

  constructor(erreur: ErreurMetier) {
    super(erreur.message);
    this.name = "ErreurSortie";
    this.erreur = erreur;
  }
}

function creer(code: CodeErreur, message: string, action: string, details?: Record<string, unknown>): ErreurSortie {
  return new ErreurSortie(details === undefined ? { code, message, action } : { code, message, action, details });
}

/** Enveloppe, fiche ou liste trop volumineuse après politique de sortie (D-T12-9, 07 §7). */
export function erreurReponseTropVolumineuseSortie(): ErreurSortie {
  return creer(
    "RESPONSE_TOO_LARGE",
    "Réponse trop volumineuse (plafond 1 Mio).",
    "Réduire le périmètre de la demande, ou utiliser la pagination pour une liste.",
  );
}

/** `inclure_brut: true` en mode PII (D-T12-3/D-T12-7), avant tout cache ou réseau. */
export function erreurPiiBrutRefuse(outil: string): ErreurSortie {
  return creer(
    "PII_POLICY",
    "`inclure_brut: true` est refusé en mode EBP_REDACT_PII.",
    "Retirer `inclure_brut`, ou désactiver EBP_REDACT_PII pour cet appel.",
    { outil },
  );
}

/** Clés scalaires de `details` conservées par `versErreurMetier` (D-T12-5) ; toute autre clé est retirée. */
const LISTE_BLANCHE_DETAILS = new Set(["outil", "option", "champ", "raison", "route", "statut", "alias", "famille"]);

function filtrerProbleme(probleme: unknown): { chemin: unknown; message: unknown } | null {
  if (probleme === null || typeof probleme !== "object") {
    return null;
  }
  const objet = probleme as Record<string, unknown>;
  return { chemin: objet["chemin"], message: objet["message"] };
}

/** Filtre `details` par liste blanche de clés scalaires (D-T12-5), `problemes[].chemin/message` compris. */
function filtrerDetails(details: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (details === undefined) {
    return undefined;
  }
  const filtre: Record<string, unknown> = {};
  for (const cle of Object.keys(details)) {
    if (cle === "problemes" && Array.isArray(details["problemes"])) {
      filtre["problemes"] = (details["problemes"] as unknown[]).map(filtrerProbleme).filter((p) => p !== null);
      continue;
    }
    if (LISTE_BLANCHE_DETAILS.has(cle)) {
      filtre[cle] = details[cle];
    }
  }
  return Object.keys(filtre).length > 0 ? filtre : undefined;
}

/** Détecte une erreur du domaine (`ErreurService`/`ErreurPagination`/`ErreurHttp`/`ErreurSortie`…) par sa forme commune. */
function estErreurDomaine(e: unknown): e is Error & { erreur: ErreurMetier } {
  if (!(e instanceof Error)) {
    return false;
  }
  const corps = (e as Error & { erreur?: unknown }).erreur;
  if (corps === null || typeof corps !== "object") {
    return false;
  }
  const candidat = corps as Partial<ErreurMetier>;
  return (
    typeof candidat.code === "string" &&
    (CODES_ERREUR as readonly string[]).includes(candidat.code) &&
    typeof candidat.message === "string" &&
    typeof candidat.action === "string"
  );
}

/** Journalisation stderr (D-T12-5) : outil, id de requête, nom de classe, code — ni message, ni stack, ni entrée. */
export interface EntreeJournalErreur {
  readonly outil: string;
  readonly requeteId: string;
  readonly classe: string;
  readonly code: string;
}

export function entreeJournalErreur(outil: string, requeteId: string, e: unknown): EntreeJournalErreur {
  const classe = e instanceof Error ? e.constructor.name : typeof e;
  const code = estErreurDomaine(e) ? e.erreur.code : "UPSTREAM_UNAVAILABLE";
  return { outil, requeteId, classe, code };
}

/**
 * `versErreurMetier` (D-T12-5) : unique conversion d'une exception en `ErreurMetier` nettoyé, pour
 * tout canal de sortie — toujours passé par `appliquerPolitiqueSortie` (D-T12-8).
 * - Erreur du domaine (un des 19 codes) : `code`/`message`/`action` conservés, `details` filtré.
 * - Toute autre exception : `UPSTREAM_UNAVAILABLE` générique, sans `details`, ni message d'origine.
 */
export function versErreurMetier(e: unknown, politique: PolitiqueSortie): ErreurMetier {
  if (estErreurDomaine(e)) {
    const brut = e.erreur;
    const details = filtrerDetails(brut.details);
    const nettoyee: ErreurMetier =
      details === undefined
        ? { code: brut.code, message: brut.message, action: brut.action }
        : { code: brut.code, message: brut.message, action: brut.action, details };
    return appliquerPolitiqueSortie(nettoyee, politique);
  }
  return {
    code: "UPSTREAM_UNAVAILABLE",
    message: "Erreur inattendue du serveur MCP",
    action: "Réessayer ; consulter les journaux stderr si l'erreur persiste",
  };
}
