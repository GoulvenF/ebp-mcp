import type { Environnement } from "../domain/capabilities.js";

/**
 * Contexte d'un appel outil/ressource, capturé en entier à l'entrée de l'appel (07 §1).
 * Aucun singleton de « dossier courant » dans un adapter : le dossier voyage dans ce contexte,
 * et une requête en vol conserve celui capturé avant tout changement concurrent.
 */
export interface ExecutionContext {
  readonly profil: string;
  readonly environnement: Environnement;
  /** Génération de l'identité auth active au moment de l'appel (07 §3). */
  readonly identiteGeneration: number;
  /** `null` pour les outils de contexte globaux. */
  readonly dossier: string | null;
  /** Tentatives HTTP restantes sur le budget de l'outil (07 §4). */
  readonly budgetRestant: number;
  readonly deadline: Date;
  readonly signal: AbortSignal;
}
