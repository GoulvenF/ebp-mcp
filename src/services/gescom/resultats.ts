import type { Completude, RaisonArret } from "../../domain/envelope.js";
import type { ContexteService, ResultatService } from "../commun/types.js";

/** Vue minimale d'un résultat de `scanner`/`resoudreUnique`, suffisante pour bâtir un `ResultatService`. */
export interface VueResultatScan<T> {
  readonly resultats: readonly T[];
  readonly pagination: ResultatService<T>["pagination"];
  readonly completude: Completude;
  readonly raisonArret: RaisonArret;
  readonly approximatif: boolean;
  readonly avertissements: readonly string[];
  readonly sources: readonly string[];
  readonly appelsSource: number;
}

/**
 * Construit le `ResultatService` commun (D-T11-1) à partir d'une vue de scan et du budget
 * initial/final de l'appel. `tentatives` = budget initial moins budget restant, auth et retries
 * compris (07 §5) : jamais recalculé différemment par un service.
 */
export function resultatServiceDepuisScan<T>(
  ctx: ContexteService,
  budgetRestantFinal: number,
  vue: VueResultatScan<T>,
  bruts: readonly unknown[] | null,
): ResultatService<T> {
  return {
    dossier: ctx.dossier.alias,
    resultats: vue.resultats,
    bruts,
    pagination: vue.pagination,
    completude: vue.completude,
    raison_arret: vue.raisonArret,
    approximatif: vue.approximatif,
    avertissements: [...vue.avertissements],
    sources: [...vue.sources],
    appels_source: vue.appelsSource,
    tentatives: ctx.execution.budgetRestant - budgetRestantFinal,
  };
}

/** `ResultatService` d'une fiche (0 ou 1 objet, `pagination: null`, 07 §5), pour les outils fiche. */
export function resultatServiceFiche<T>(
  ctx: ContexteService,
  budgetRestantFinal: number,
  resultat: T,
  brut: unknown | null,
  options: { readonly sources: readonly string[]; readonly appelsSource: number; readonly avertissements?: readonly string[] },
): ResultatService<T> {
  return {
    dossier: ctx.dossier.alias,
    resultats: [resultat],
    bruts: brut === null ? null : [brut],
    pagination: null,
    completude: "complete",
    raison_arret: null,
    approximatif: false,
    avertissements: options.avertissements !== undefined ? [...options.avertissements] : [],
    sources: [...options.sources],
    appels_source: options.appelsSource,
    tentatives: ctx.execution.budgetRestant - budgetRestantFinal,
  };
}
