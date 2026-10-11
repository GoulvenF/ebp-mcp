/**
 * Jeu de démonstration SYNTHÉTIQUE v0.1 (T13-1) : barrel + date de référence fixe pour les calculs
 * de retard (échéancier, 07 §8). Toutes les données référencées ici sont fictives (05/06).
 */
export * from "./cpt.js";
export * from "./gc.js";
export { JEU_CPT_DEMO } from "./cpt.js";
export { JEU_GC_DEMO } from "./gc.js";

/**
 * Date de référence fixe de la démo (synthétique) : à utiliser avec une horloge contrôlée
 * (`creerHorlogeControlee(DATE_REFERENCE_DEMO)`) pour que `jours_retard`/`en_retard` du jeu de
 * démonstration restent reproductibles indépendamment de la date réelle d'exécution des tests.
 */
export const DATE_REFERENCE_DEMO = new Date("2026-03-15T00:00:00.000Z");
