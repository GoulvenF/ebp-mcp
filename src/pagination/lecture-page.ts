import type { Environnement, Famille } from "../domain/capabilities.js";
import type { ErreurMetier } from "../domain/errors.js";
import type { Budget } from "../http/budget.js";
import type { Clock } from "../ports/clock.js";
import type { CacheSource, CleCache } from "./cache.js";
import { erreurPaginationUpstreamInvalide, erreurScanAnnule } from "./errors.js";
import type { PageSource, PositionSource, SourcePaginee } from "./source-page.js";

function normaliserProfond(valeur: unknown): unknown {
  if (typeof valeur === "string") {
    return valeur.normalize("NFC");
  }
  if (Array.isArray(valeur)) {
    return valeur.map((v) => normaliserProfond(v));
  }
  if (valeur !== null && typeof valeur === "object") {
    const source = valeur as Record<string, unknown>;
    const resultat: Record<string, unknown> = {};
    for (const cle of Object.keys(source).sort()) {
      resultat[cle] = normaliserProfond(source[cle]);
    }
    return resultat;
  }
  return valeur;
}

/** Sérialisation canonique et déterministe : ordre de clés stable, NFC (07 §5). */
export function empreinteCanonique(valeur: unknown): string {
  return JSON.stringify(normaliserProfond(valeur) ?? null);
}

export function memeEnsembleIds(a: readonly string[], b: readonly string[]): boolean {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) {
    return false;
  }
  const trieA = [...a].sort();
  const trieB = [...b].sort();
  return trieA.every((v, i) => v === trieB[i]);
}

/**
 * Lit la raison d'arrêt attendue (`budget`/`quota`/`deadline`) portée par une erreur du client
 * HTTP ou du quota (`code: RESOLUTION_INCOMPLETE`, `details.raison`). Toute autre erreur — y
 * compris `raison: "annule"` — n'est pas reconnue ici et doit être propagée telle quelle par
 * l'appelant (auth, droits, schéma invalide, panne durable, annulation).
 */
export function raisonArretDepuisErreur(erreur: unknown): "budget" | "quota" | "deadline" | null {
  if (!(erreur instanceof Error)) {
    return null;
  }
  const porteur = erreur as Error & { erreur?: ErreurMetier };
  const corps = porteur.erreur;
  if (corps === undefined || corps.code !== "RESOLUTION_INCOMPLETE") {
    return null;
  }
  const raison = corps.details?.["raison"];
  return raison === "budget" || raison === "quota" || raison === "deadline" ? raison : null;
}

export function budgetOuDeadlineEpuises(clock: Clock, budget: Budget): "budget" | "deadline" | null {
  if (clock.now().getTime() >= budget.deadline.getTime()) {
    return "deadline";
  }
  if (budget.restant < 1) {
    return "budget";
  }
  return null;
}

/** Contexte d'identité minimal nécessaire à une clé de cache (07 §5), sans `limite` ni curseur. */
export interface ContextePageCle {
  readonly profil: string;
  readonly identiteGeneration: number;
  readonly environnement: Environnement;
  readonly famille: Famille;
  readonly dossier: string | null;
  readonly empreinteFiltre: string;
}

export interface ResultatLecturePageGardee<E> {
  readonly page: PageSource<E> | null;
  readonly raisonArret: "budget" | "quota" | "deadline" | null;
  readonly depuisCache: boolean;
}

/**
 * Lecture d'une page avec les gardes communes à `scanner` et `parcourir` (D-T11-12) : annulation
 * propagée, budget/quota/deadline ⇒ arrêt partiel signalé (jamais une erreur), cache (coût zéro),
 * page répétée ou position inchangée ⇒ `UPSTREAM_PAGINATION_INVALID`, auth/schéma invalide ⇒
 * erreur propagée telle quelle. Ne décide d'aucune politique de limite/curseur : l'appelant choisit.
 */
export async function lirePageGardee<E>(
  deps: { readonly cache: CacheSource; readonly clock: Clock },
  budget: Budget,
  source: SourcePaginee<E>,
  contexteCle: ContextePageCle,
  position: PositionSource,
  idsDernierePage: readonly string[],
): Promise<ResultatLecturePageGardee<E>> {
  if (budget.signal?.aborted === true) {
    throw erreurScanAnnule();
  }
  const epuise = budgetOuDeadlineEpuises(deps.clock, budget);
  if (epuise !== null) {
    return { page: null, raisonArret: epuise, depuisCache: false };
  }

  const cle: CleCache = { ...contexteCle, sourceId: source.id, position };
  let page: PageSource<E>;
  let depuisCache = true;
  const enCache = deps.cache.lire<E>(cle);
  if (enCache !== null) {
    page = enCache;
  } else {
    depuisCache = false;
    try {
      page = await source.lirePage(position, budget);
    } catch (erreur) {
      const raison = raisonArretDepuisErreur(erreur);
      if (raison !== null) {
        return { page: null, raisonArret: raison, depuisCache: false };
      }
      throw erreur;
    }
  }

  const idsPage = page.elements.map((element) => source.idElement(element));
  const positionInchangee =
    position !== null && page.suivant !== null && empreinteCanonique(page.suivant) === empreinteCanonique(position);
  const pageRepetee = memeEnsembleIds(idsPage, idsDernierePage);
  if (positionInchangee || pageRepetee) {
    throw erreurPaginationUpstreamInvalide(source.id, positionInchangee ? "position_inchangee" : "page_repetee");
  }

  if (!depuisCache) {
    deps.cache.ecrire(cle, page, source.nature);
  }

  return { page, raisonArret: null, depuisCache };
}
