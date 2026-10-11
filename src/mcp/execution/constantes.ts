/** Budget de tentatives HTTP par appel d'outil, auth et retries compris (D-T12-3, 07 §4). */
export const BUDGET_TENTATIVES_OUTIL = 30;

/** Deadline d'un appel d'outil depuis sa réception (D-T12-3, 07 §4), en millisecondes. */
export const DEADLINE_OUTIL_MS = 60_000;
