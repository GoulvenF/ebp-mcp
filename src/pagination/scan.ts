import type { Environnement, Famille } from "../domain/capabilities.js";
import type { Completude, Pagination, RaisonArret } from "../domain/envelope.js";
import type { Budget } from "../http/budget.js";
import { creerBudget } from "../http/budget.js";
import type { Clock } from "../ports/clock.js";
import type { ExecutionContext } from "../ports/execution-context.js";
import { CacheSource } from "./cache.js";
import { MagasinCurseurs } from "./curseurs.js";
import type { EtatCurseur } from "./curseurs.js";
import { erreurLimiteInvalide, erreurScanAnnule } from "./errors.js";
import {
  budgetOuDeadlineEpuises,
  empreinteCanonique,
  lirePageGardee,
  raisonArretDepuisErreur,
} from "./lecture-page.js";
import type { PositionSource, SourcePaginee } from "./source-page.js";

/**
 * Identité normalisée d'un parcours (07 §5) : lie le curseur et la clé de cache à l'outil, au
 * profil, à l'`identiteGeneration`, à l'environnement, à la famille, au dossier, à une empreinte
 * normalisée des filtres/tri/projection et à `limite`.
 */
export interface IdentiteScan {
  readonly outil: string;
  readonly profil: string;
  readonly identiteGeneration: number;
  readonly environnement: Environnement;
  readonly famille: Famille;
  readonly dossier: string | null;
  readonly limite: number;
  readonly filtres?: unknown;
  readonly tri?: unknown;
  readonly projection?: unknown;
}

export interface OptionsScan<E, R> {
  readonly contexte: ExecutionContext;
  readonly source: SourcePaginee<E>;
  readonly limite: number;
  readonly curseur?: string;
  readonly identite: IdentiteScan;
  /** Filtre local optionnel, appliqué avant tout enrichissement. */
  readonly filtre?: (element: E) => boolean;
  /** Enrichissement borné, optionnel : consomme le même budget que la lecture de pages. */
  readonly enrichir?: (element: E, budget: Budget) => Promise<E>;
  /** Projection optionnelle vers la forme de sortie ; identité si absente (`R` doit alors valoir `E`). */
  readonly projeter?: (element: E) => R;
  /**
   * Budget partagé explicite (D-T11-2, extension additive) : si fourni, remplace
   * `creerBudget(contexte)`. Comportement inchangé si absent.
   */
  readonly budget?: Budget;
  /**
   * Aucun état de curseur n'est enregistré pour ce parcours (D-T11-3, extension additive) : la
   * sortie porte toujours `curseur: null`, même si le parcours n'est pas terminé.
   */
  readonly sansCurseur?: boolean;
  /**
   * Filtre additionnel appliqué après enrichissement (D-T11-8, extension additive) : un élément
   * rejeté est marqué vu, n'est jamais rendu et n'est pas compté dans `pagination.total`.
   */
  readonly filtreApresEnrichissement?: (element: E) => boolean;
}

/** Sortie du moteur (07 §5) : jamais l'`Enveloppe` finale, aucune politique PII (T12). */
export interface ResultatScan<R> {
  readonly resultats: R[];
  readonly pagination: Pagination;
  readonly completude: Completude;
  readonly raisonArret: RaisonArret;
  readonly approximatif: boolean;
  readonly avertissements: string[];
  readonly sources: string[];
  /** Appels source réellement émis (pages + enrichissements), pour `meta.appels_api`. */
  readonly appelsSource: number;
}

/** Dépendances mutualisées du moteur, partagées par tous les appels d'un même processus. */
export interface DepsScan {
  readonly curseurs: MagasinCurseurs;
  readonly cache: CacheSource;
  readonly clock: Clock;
}

/** Empreinte des seuls filtres/tri/projection, partagée entre le curseur et la clé de cache. */
export function empreinteFiltreTriProjection(identite: IdentiteScan): string {
  return empreinteCanonique({
    filtres: identite.filtres ?? null,
    tri: identite.tri ?? null,
    projection: identite.projection ?? null,
  });
}

/** Empreinte complète d'identité de scan, utilisée comme clé de correspondance du curseur. */
export function empreinteIdentiteScan(identite: IdentiteScan): string {
  return empreinteCanonique({
    outil: identite.outil,
    profil: identite.profil,
    identiteGeneration: identite.identiteGeneration,
    environnement: identite.environnement,
    famille: identite.famille,
    dossier: identite.dossier,
    limite: identite.limite,
    empreinteFiltre: empreinteFiltreTriProjection(identite),
  });
}

interface EtatMutable<E> {
  position: PositionSource;
  elementsEnAttente: E[];
  idsVus: Set<string>;
  idsDernierePage: string[];
  totalFiltreAccumule: number;
  totalSourceConnu: number | null;
  sourceTerminee: boolean;
}

/**
 * Moteur de scan / filtrage / enrichissement / arrêt partiel (07 §5, audits A11/A20). Lit des
 * pages d'une `SourcePaginee` abstraite, filtre et enrichit localement, rend au plus `limite`
 * résultats **filtrés** et déclare explicitement pourquoi il s'est arrêté. Ne construit pas
 * l'`Enveloppe` finale et n'applique aucune politique PII (T12).
 */
export async function scanner<E, R = E>(deps: DepsScan, options: OptionsScan<E, R>): Promise<ResultatScan<R>> {
  const { contexte, source, limite, identite } = options;
  if (!Number.isInteger(limite) || limite < 1 || limite > 500) {
    throw erreurLimiteInvalide(limite);
  }

  const empreinte = empreinteIdentiteScan(identite);
  const empreinteFiltre = empreinteFiltreTriProjection(identite);
  const projeter = options.projeter ?? ((element: E): R => element as unknown as R);

  const etat: EtatMutable<E> = {
    position: null,
    elementsEnAttente: [],
    idsVus: new Set<string>(),
    idsDernierePage: [],
    totalFiltreAccumule: 0,
    totalSourceConnu: null,
    sourceTerminee: false,
  };

  let tokenConsomme: string | null = null;
  if (options.curseur !== undefined) {
    const repris = deps.curseurs.consommer<E>(options.curseur, empreinte);
    tokenConsomme = options.curseur;
    etat.position = repris.position;
    etat.elementsEnAttente = [...repris.elementsEnAttente];
    etat.idsVus = new Set(repris.idsVus);
    etat.idsDernierePage = [...repris.idsDernierePage];
    etat.totalFiltreAccumule = repris.totalFiltreAccumule;
    etat.totalSourceConnu = repris.totalSourceConnu;
    etat.sourceTerminee = repris.sourceTerminee;
  }

  const budget = options.budget ?? creerBudget(contexte);
  const resultats: R[] = [];
  const avertissements: string[] = [];
  let appelsSource = 0;
  let raisonArret: RaisonArret = null;
  let approximatif = false;
  let interrompu = false;

  function marquerArretPartiel(raison: "budget" | "quota" | "deadline" | "source_incomplete", libelle: string): void {
    raisonArret = raison;
    approximatif = true;
    interrompu = true;
    avertissements.push(libelle);
  }

  async function drainerBuffer(): Promise<void> {
    while (etat.elementsEnAttente.length > 0 && resultats.length < limite && !interrompu) {
      if (budget.signal?.aborted === true) {
        throw erreurScanAnnule();
      }
      const element = etat.elementsEnAttente[0] as E;
      let enrichi: E;
      try {
        if (options.enrichir !== undefined) {
          const epuise = budgetOuDeadlineEpuises(deps.clock, budget);
          if (epuise !== null) {
            marquerArretPartiel(epuise, `Parcours interrompu avant enrichissement (${epuise}).`);
            break;
          }
          enrichi = await options.enrichir(element, budget);
          appelsSource += 1;
        } else {
          enrichi = element;
        }
      } catch (erreur) {
        const raison = raisonArretDepuisErreur(erreur);
        if (raison !== null) {
          marquerArretPartiel(raison, `Enrichissement interrompu (${raison}).`);
          break;
        }
        throw erreur;
      }

      etat.elementsEnAttente.shift();
      if (options.filtreApresEnrichissement !== undefined && !options.filtreApresEnrichissement(enrichi)) {
        // D-T11-8 : rejeté après enrichissement — marqué vu, jamais rendu, jamais recompté.
        etat.idsVus.add(source.idElement(element));
        etat.totalFiltreAccumule -= 1;
        continue;
      }
      resultats.push(projeter(enrichi));
      etat.idsVus.add(source.idElement(element));
    }
  }

  try {
    await drainerBuffer();

    while (resultats.length < limite && !etat.sourceTerminee && !interrompu) {
      const positionDemandee = etat.position;
      const resultatPage = await lirePageGardee(
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
        positionDemandee,
        etat.idsDernierePage,
      );

      if (resultatPage.raisonArret !== null) {
        marquerArretPartiel(
          resultatPage.raisonArret,
          `Parcours interrompu pendant la lecture de page (${resultatPage.raisonArret}).`,
        );
        break;
      }
      const page = resultatPage.page as NonNullable<typeof resultatPage.page>;
      if (!resultatPage.depuisCache) {
        appelsSource += 1;
      }

      const idsPage = page.elements.map((element) => source.idElement(element));
      if (page.totalSource !== null) {
        etat.totalSourceConnu = page.totalSource;
      }
      etat.idsDernierePage = idsPage;
      etat.position = page.suivant;
      etat.sourceTerminee = page.suivant === null;

      const matches: E[] = [];
      for (const element of page.elements) {
        const id = source.idElement(element);
        if (etat.idsVus.has(id)) {
          continue;
        }
        if (options.filtre === undefined || options.filtre(element)) {
          matches.push(element);
        }
      }
      etat.totalFiltreAccumule += matches.length;
      etat.elementsEnAttente = matches;

      await drainerBuffer();

      if (!interrompu && page.sourceIncomplete === true) {
        marquerArretPartiel("source_incomplete", "La source a déclaré une limitation intrinsèque pour cette page.");
      }
    }

    const hasMore = etat.elementsEnAttente.length > 0 || !etat.sourceTerminee;
    let completude: Completude;
    if (interrompu) {
      completude = "partielle";
    } else if (hasMore) {
      completude = "page";
      raisonArret = "limite";
    } else {
      completude = "complete";
      raisonArret = null;
      approximatif = false;
    }

    let curseurFinal: string | null = null;
    if (hasMore && options.sansCurseur !== true) {
      const etatPersiste: EtatCurseur<E> = {
        position: etat.position,
        elementsEnAttente: etat.elementsEnAttente,
        idsVus: etat.idsVus,
        idsDernierePage: etat.idsDernierePage,
        totalFiltreAccumule: etat.totalFiltreAccumule,
        totalSourceConnu: etat.totalSourceConnu,
        sourceTerminee: etat.sourceTerminee,
      };
      const token = deps.curseurs.enregistrer(empreinte, identite.identiteGeneration, etatPersiste);
      if (token === null) {
        raisonArret = "cursor_capacity";
        completude = "partielle";
        approximatif = true;
        avertissements.push("Capacité mémoire des curseurs atteinte ; aucune reprise possible pour ce parcours.");
      } else {
        curseurFinal = token;
      }
    }

    const pagination: Pagination = {
      renvoyes: resultats.length,
      total: completude === "complete" ? etat.totalFiltreAccumule : null,
      total_source: etat.totalSourceConnu,
      hasMore,
      curseur: curseurFinal,
    };

    return {
      resultats,
      pagination,
      completude,
      raisonArret,
      approximatif,
      avertissements,
      sources: [source.id],
      appelsSource,
    };
  } finally {
    if (tokenConsomme !== null) {
      deps.curseurs.liberer(tokenConsomme);
    }
  }
}
