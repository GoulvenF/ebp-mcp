import type { Environnement, Famille } from "../domain/capabilities.js";
import type { Completude, RaisonArret } from "../domain/envelope.js";
import type { Budget } from "../http/budget.js";
import { creerBudget } from "../http/budget.js";
import type { ExecutionContext } from "../ports/execution-context.js";
import type { DepsScan } from "./scan.js";
import type { ResultatLecturePageGardee } from "./lecture-page.js";
import { empreinteCanonique, lirePageGardee, raisonArretDepuisErreur } from "./lecture-page.js";
import type { PositionSource, SourcePaginee } from "./source-page.js";

/**
 * Identité minimale d'un parcours d'agrégat (D-T11-12) : pas de `limite` ni de tri/projection —
 * un agrégat v0.1 n'est pas repris par curseur (07 §5), seuls `filtres` participent à la clé de
 * cache et de déduplication.
 */
export interface IdentiteParcours {
  readonly outil: string;
  readonly profil: string;
  readonly identiteGeneration: number;
  readonly environnement: Environnement;
  readonly famille: Famille;
  readonly dossier: string | null;
  readonly filtres?: unknown;
}

export interface OptionsParcours<E> {
  readonly contexte: ExecutionContext;
  readonly budget?: Budget;
  readonly source: SourcePaginee<E>;
  readonly identite: IdentiteParcours;
  /** Filtre local optionnel, appliqué avant `surElement`. */
  readonly filtre?: (element: E) => boolean;
  /** Appelé pour chaque élément retenu (filtré, non dédupliqué) ; peut consommer le budget. */
  readonly surElement: (element: E, budget: Budget) => void | Promise<void>;
}

/** Sortie d'un parcours d'agrégat (D-T11-12) : jamais de `pagination`, jamais de curseur. */
export interface ResultatParcours {
  readonly elementsParcourus: number;
  readonly completude: Completude;
  readonly raisonArret: RaisonArret;
  readonly approximatif: boolean;
  readonly avertissements: string[];
  readonly sources: string[];
  readonly appelsSource: number;
}

/**
 * Parcours intégral d'une source paginée pour un agrégat (D-T11-12, ex. balance de mouvements) :
 * lit toutes les pages jusqu'à épuisement de la source ou interruption (budget/quota/deadline/
 * annulation/source incomplète), applique `filtre` puis `surElement` à chaque élément retenu,
 * **sans jamais enregistrer de curseur** (07 §5 : les agrégats v0.1 ne sont pas reprenables).
 * Factorise avec `scanner` la lecture de page et ses gardes via `lirePageGardee` (page répétée,
 * position inchangée, budget/quota/deadline, cache, annulation, auth/schéma propagés).
 */
export async function parcourir<E>(deps: DepsScan, options: OptionsParcours<E>): Promise<ResultatParcours> {
  const { contexte, source, identite } = options;
  const budget = options.budget ?? creerBudget(contexte);
  const empreinteFiltre = empreinteCanonique({ filtres: identite.filtres ?? null });

  let position: PositionSource = null;
  let idsDernierePage: string[] = [];
  const idsVus = new Set<string>();
  let elementsParcourus = 0;
  let appelsSource = 0;
  const avertissements: string[] = [];
  let raisonArret: RaisonArret = null;
  let approximatif = false;
  let interrompu = false;
  let sourceTerminee = false;

  while (!sourceTerminee && !interrompu) {
    const resultatPage: ResultatLecturePageGardee<E> = await lirePageGardee<E>(
      deps,
      budget,
      source,
      {
        profil: identite.profil,
        identiteGeneration: identite.identiteGeneration,
        environnement: identite.environnement,
        famille: identite.famille,
        dossier: identite.dossier,
        empreinteFiltre,
      },
      position,
      idsDernierePage,
    );

    if (resultatPage.raisonArret !== null) {
      raisonArret = resultatPage.raisonArret;
      approximatif = true;
      interrompu = true;
      avertissements.push(`Parcours d'agrégat interrompu pendant la lecture de page (${resultatPage.raisonArret}).`);
      break;
    }
    const page = resultatPage.page as NonNullable<typeof resultatPage.page>;
    if (!resultatPage.depuisCache) {
      appelsSource += 1;
    }

    const idsPage = page.elements.map((element) => source.idElement(element));
    idsDernierePage = idsPage;
    position = page.suivant;
    sourceTerminee = page.suivant === null;

    for (const element of page.elements) {
      const id = source.idElement(element);
      if (idsVus.has(id)) {
        continue;
      }
      idsVus.add(id);
      if (options.filtre !== undefined && !options.filtre(element)) {
        continue;
      }
      try {
        await options.surElement(element, budget);
      } catch (erreur) {
        const raison = raisonArretDepuisErreur(erreur);
        if (raison !== null) {
          raisonArret = raison;
          approximatif = true;
          interrompu = true;
          avertissements.push(`Parcours d'agrégat interrompu pendant le traitement d'un élément (${raison}).`);
          break;
        }
        throw erreur;
      }
      elementsParcourus += 1;
    }

    if (!interrompu && page.sourceIncomplete === true) {
      raisonArret = "source_incomplete";
      approximatif = true;
      interrompu = true;
      avertissements.push("La source a déclaré une limitation intrinsèque pour cette page.");
    }
  }

  const completude: Completude = interrompu ? "partielle" : "complete";

  return {
    elementsParcourus,
    completude,
    raisonArret,
    approximatif,
    avertissements,
    sources: [source.id],
    appelsSource,
  };
}
