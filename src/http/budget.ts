import type { ExecutionContext } from "../ports/execution-context.js";

/**
 * Compteur mutable partagé par toutes les requêtes d'un même appel d'outil (décision 9, 07 §4) :
 * créé une fois depuis l'`ExecutionContext`, chaque tentative (auth et retry inclus) décrémente
 * `restant` via `consommer`. `src/ports/execution-context.ts` reste inchangé.
 */
export interface Budget {
  restant: number;
  consommer(n: number): void;
  readonly deadline: Date;
  readonly signal?: AbortSignal;
}

export function creerBudget(contexte: ExecutionContext): Budget {
  const budget: Budget = {
    restant: contexte.budgetRestant,
    deadline: contexte.deadline,
    signal: contexte.signal,
    consommer(n: number): void {
      budget.restant -= n;
    },
  };
  return budget;
}
