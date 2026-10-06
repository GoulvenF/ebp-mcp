/** Les 19 codes d'erreur stables de 07 §7. Ne pas en ajouter sans modifier le contrat. */
export const CODES_ERREUR = [
  "INVALID_ARGUMENT",
  "CONFIG_INVALID",
  "DOSSIER_REQUIRED",
  "DOSSIER_UNKNOWN",
  "UNSUPPORTED_CAPABILITY",
  "AUTH_REQUIRED",
  "AUTH_STORAGE_FAILED",
  "PERMISSION_DENIED",
  "NOT_FOUND",
  "AMBIGUOUS_REFERENCE",
  "RESOLUTION_INCOMPLETE",
  "CURSOR_MISMATCH",
  "CURSOR_EXPIRED",
  "CURSOR_BUSY",
  "UPSTREAM_UNAVAILABLE",
  "UPSTREAM_SCHEMA_CHANGED",
  "UPSTREAM_PAGINATION_INVALID",
  "RESPONSE_TOO_LARGE",
  "PII_POLICY",
] as const;

export type CodeErreur = (typeof CODES_ERREUR)[number];

/** Corps d'erreur stable (07 §5) : jamais de stack, d'URL sensible ou de secret. */
export interface ErreurMetier {
  code: CodeErreur;
  message: string;
  action: string;
  details?: Record<string, unknown>;
}
