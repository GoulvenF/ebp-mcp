import { z } from "zod";
import { validerEntree } from "../commun/entrees.js";

/**
 * Entrée des services de ressources (D-T12-13) : aucun champ métier propre à une ressource v0.1
 * (ni `dossier` ni `inclure_brut` : le dossier est déjà résolu par l'appelant via la config seule,
 * 07 §6, et une ressource n'a pas de variante brute). Objet strict : toute clé inconnue est
 * refusée avant réseau (07 §4, ordre de validation schéma → famille/capacités → cache/scan → réseau).
 */
export const RessourceEntreeSchema = z.object({}).strict();

export function validerEntreeRessource(entreeBrute: unknown, ressource: string): Record<string, never> {
  return validerEntree(RessourceEntreeSchema, entreeBrute, ressource) as Record<string, never>;
}
