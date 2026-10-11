import type { Famille } from "../../domain/capabilities.js";
import { exercices } from "../compta/exercices.js";
import type { ContexteService, DepsService, ResultatService } from "../commun/types.js";
import { journauxRessource } from "./journaux.js";
import { planComptableRessource } from "./plan-comptable.js";
import { tauxTvaRessource } from "./taux-tva.js";

/** Service de ressource de dossier, signature D-T11-1 commune aux 4 suffixes ci-dessous. */
export type ServiceRessourceDossier = (
  deps: DepsService,
  ctx: ContexteService,
  entree: unknown,
) => Promise<ResultatService<unknown>>;

export interface DefinitionRessourceDossier {
  readonly suffixe: string;
  readonly familles: readonly Famille[];
  readonly service: ServiceRessourceDossier;
}

/**
 * Registre des ressources de dossier v0.1 (D-T12-13, 07 §6) : `ebp://{alias}/{suffixe}`. Le lot 3
 * l'utilise pour `resources/list` (ne proposer un suffixe que pour un dossier dont la famille est
 * dans `familles`) et `resources/read` (router vers `service`). `exercices` réutilise tel quel le
 * service T11 (`src/services/compta/exercices.ts`), sans copie.
 */
export const RESSOURCES_DOSSIER: readonly DefinitionRessourceDossier[] = [
  { suffixe: "exercices", familles: ["hubbix-compta"], service: exercices },
  { suffixe: "journaux", familles: ["hubbix-compta"], service: journauxRessource },
  { suffixe: "plan-comptable", familles: ["hubbix-compta"], service: planComptableRessource },
  { suffixe: "taux-tva", familles: ["hubbix-compta", "hubbix-gescom"], service: tauxTvaRessource },
];
