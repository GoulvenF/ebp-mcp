import { CODES_ERREUR, type CodeErreur, type ErreurMetier } from "../domain/errors.js";

/**
 * Table normative des codes de sortie du binaire (T13-3, 07 §12, D-T13-9) : un seul endroit, testé
 * ligne par ligne par `tests/cli/exit-codes.test.ts`. `0` (succès) n'apparaît pas ici : cette table
 * ne couvre que la correspondance code d'erreur métier -> code de sortie non nul.
 *
 * - `2` : entrée/config invalide (`INVALID_ARGUMENT`, `CONFIG_INVALID`, `DOSSIER_REQUIRED`,
 *   `DOSSIER_UNKNOWN`), et toute erreur d'usage CLI (commande/option inconnue, arguments manquants,
 *   voir {@link ErreurUsageCli}).
 * - `3` : `AUTH_REQUIRED`.
 * - `1` : tout le reste (erreurs métier non classées ci-dessus, erreurs inattendues).
 */
export const TABLE_CODES_SORTIE: ReadonlyArray<{ readonly code: CodeErreur; readonly exitCode: 1 | 2 | 3 }> =
  CODES_ERREUR.map((code) => ({ code, exitCode: calculerCodeSortie(code) }));

function calculerCodeSortie(code: CodeErreur): 1 | 2 | 3 {
  if (code === "AUTH_REQUIRED") return 3;
  if (
    code === "INVALID_ARGUMENT" ||
    code === "CONFIG_INVALID" ||
    code === "DOSSIER_REQUIRED" ||
    code === "DOSSIER_UNKNOWN"
  ) {
    return 2;
  }
  return 1;
}

const CODE_VERS_SORTIE = new Map<CodeErreur, 1 | 2 | 3>(TABLE_CODES_SORTIE.map((l) => [l.code, l.exitCode]));

/**
 * Erreur d'usage CLI (D-T13-9) : commande/option inconnue, argument manquant. Jamais un des 19
 * codes de `CODES_ERREUR` au sens strict, mais classée `INVALID_ARGUMENT` (code de sortie 2) pour
 * traverser la même table sans y ajouter de cas particulier.
 */
export class ErreurUsageCli extends Error {
  readonly erreur: ErreurMetier;

  constructor(message: string) {
    super(message);
    this.name = "ErreurUsageCli";
    this.erreur = { code: "INVALID_ARGUMENT", message, action: "Consulter `ebp-mcp --help`." };
  }
}

/** Détecte une erreur du domaine (`ErreurConfig`/`ErreurAuth`/`ErreurService`/…) par sa forme commune. */
function estErreurDomaine(e: unknown): e is Error & { erreur: ErreurMetier } {
  if (!(e instanceof Error)) return false;
  const corps = (e as Error & { erreur?: unknown }).erreur;
  if (corps === null || typeof corps !== "object") return false;
  const candidat = corps as Partial<ErreurMetier>;
  return (
    typeof candidat.code === "string" &&
    (CODES_ERREUR as readonly string[]).includes(candidat.code) &&
    typeof candidat.message === "string" &&
    typeof candidat.action === "string"
  );
}

/** Code de sortie du processus pour une exception donnée (D-T13-9) : jamais 0 (réservé au succès). */
export function codeSortiePourErreur(e: unknown): 1 | 2 | 3 {
  if (estErreurDomaine(e)) {
    return CODE_VERS_SORTIE.get(e.erreur.code) ?? 1;
  }
  return 1;
}

/**
 * Ligne unique `CODE : message` écrite sur stderr (D-T13-9) : jamais de trace de pile, jamais le
 * message brut d'une exception non reconnue (qui pourrait contenir un détail interne), jamais de
 * secret — `ErreurMetier.message` est déjà assaini par construction dans tout le reste du code.
 */
export function ligneErreurCli(e: unknown): string {
  if (estErreurDomaine(e)) {
    return `${e.erreur.code} : ${e.erreur.message}`;
  }
  return "UPSTREAM_UNAVAILABLE : erreur inattendue.";
}
