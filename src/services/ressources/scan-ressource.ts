import type { Budget } from "../../http/budget.js";
import type { IdentiteScan } from "../../pagination/scan.js";
import { scanner } from "../../pagination/scan.js";
import type { SourcePaginee } from "../../pagination/source-page.js";
import type { ContexteService, DepsService, ResultatService } from "../commun/types.js";
import { AVERTISSEMENT_RESSOURCE_LIMITEE, LIMITE_RESSOURCE } from "./constantes.js";

/**
 * Parcours commun des ressources de dossier (D-T12-13) : `scanner` avec `limite: LIMITE_RESSOURCE`
 * et `sansCurseur: true` (⇒ `pagination.curseur` toujours `null`), avertissement exact ajouté si
 * `hasMore`, `bruts: null` toujours (une ressource n'a pas de variante brute en v0.1). Partagé par
 * `journaux`/`plan-comptable`/`taux-tva` plutôt que dupliqué, et évite à `tauxTvaRessource` de
 * construire une `SourcePaginee` de type union (CPT/GC) avant l'appel à `scanner`.
 */
export async function scannerRessourceDossier<T>(
  deps: DepsService,
  ctx: ContexteService,
  budget: Budget,
  budgetInitial: number,
  outil: string,
  source: SourcePaginee<T>,
  avertissementsSource: readonly string[],
): Promise<ResultatService<T>> {
  const identite: IdentiteScan = {
    outil,
    profil: ctx.execution.profil,
    identiteGeneration: ctx.execution.identiteGeneration,
    environnement: ctx.execution.environnement,
    famille: ctx.dossier.famille,
    dossier: ctx.dossier.id,
    limite: LIMITE_RESSOURCE,
  };

  const resultatScan = await scanner(deps.scan, {
    contexte: ctx.execution,
    source,
    limite: LIMITE_RESSOURCE,
    sansCurseur: true,
    identite,
    budget,
  });

  const avertissements = [...avertissementsSource, ...resultatScan.avertissements];
  if (resultatScan.pagination.hasMore) {
    avertissements.push(AVERTISSEMENT_RESSOURCE_LIMITEE);
  }

  return {
    dossier: ctx.dossier.id,
    resultats: resultatScan.resultats,
    bruts: null,
    pagination: resultatScan.pagination,
    completude: resultatScan.completude,
    raison_arret: resultatScan.raisonArret,
    approximatif: resultatScan.approximatif,
    avertissements,
    sources: resultatScan.sources,
    appels_source: resultatScan.appelsSource,
    tentatives: budgetInitial - budget.restant,
  };
}
