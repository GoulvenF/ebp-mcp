import type { z } from "zod";
import type { Budget } from "../../http/budget.js";
import type { ContexteHttp, DependancesClientHttp } from "../../http/client.js";
import { executerRequetePourRoute } from "../../http/client.js";
import { decimalDepuisLexeme } from "../../domain/decimal.js";
import { interpreterEnum } from "../../domain/enum.js";
import { ArticleSchema } from "../../domain/schemas/gescom.js";
import { lireEnveloppeListe, lireFiche } from "./enveloppe.js";
import { erreurEnveloppeInattendue, erreurPaginationInvalide, erreurSkipInvalide, erreurTakeInvalide } from "./errors.js";
import { ArticleEbpSchema } from "./schemas-ebp.js";

export type Article = z.infer<typeof ArticleSchema>;

const TYPES_ARTICLE_SOURCE = ["GoodItem", "ServiceItem"] as const;
/** `ItemStatus` (02 §3) : `Active = 0`, `Inactive = 1`. Codé en chaîne pour réutiliser `interpreterEnum`. */
const CODES_ITEM_STATUS = ["0", "1"] as const;

function mapperType(itemType: unknown): { type: Article["type"]; avertissement: string | null } {
  const resultat = interpreterEnum(itemType, TYPES_ARTICLE_SOURCE);
  if (resultat.valeur === "inconnu") {
    return { type: "inconnu", avertissement: resultat.avertissement };
  }
  return { type: resultat.valeur === "GoodItem" ? "bien" : "service", avertissement: null };
}

function mapperActif(itemStatus: unknown): { actif: boolean | null; avertissement: string | null } {
  const brut = typeof itemStatus === "number" ? String(itemStatus) : null;
  const resultat = interpreterEnum(brut, CODES_ITEM_STATUS);
  if (resultat.valeur === "inconnu") {
    return { actif: null, avertissement: resultat.avertissement };
  }
  return { actif: resultat.valeur === "0", avertissement: null };
}

/**
 * Mappe un élément de `/items` ou une fiche `/items/goods|services/{id}` vers le domaine (07 §5) :
 * décimaux via `decimalDepuisLexeme` (jamais `Number`), devise `null` (non documentée par 02 pour
 * cette route), enums via `interpreterEnum` (`inconnu` + avertissement, jamais de repli silencieux).
 * Forme inattendue (champ documenté manquant ou de type différent) ⇒ `UPSTREAM_SCHEMA_CHANGED`.
 */
/**
 * Mappe et renvoie en plus l'élément source **validé** par `ArticleEbpSchema` (extension
 * additive D-T11-14) : `source` sert exclusivement à `inclure_brut`, jamais au mapping lui-même
 * qui reste basé sur les champs déjà extraits ci-dessous.
 */
function mapperArticleAvecSource(
  brut: unknown,
  routeId: string,
  avertissements: string[],
): { article: Article; source: unknown } {
  const resultat = ArticleEbpSchema.safeParse(brut);
  if (!resultat.success) {
    throw erreurEnveloppeInattendue(routeId);
  }
  const source = resultat.data;
  const { type, avertissement: avertissementType } = mapperType(source.itemType);
  if (avertissementType !== null) avertissements.push(avertissementType);
  const { actif, avertissement: avertissementActif } = mapperActif(source.itemStatus);
  if (avertissementActif !== null) avertissements.push(avertissementActif);
  return {
    article: {
      id: source.id,
      code: source.code,
      libelle: source.label,
      type,
      prix_ht: decimalDepuisLexeme(source.priceVatExcluded),
      prix_ttc: decimalDepuisLexeme(source.priceVatIncluded),
      taux_tva: decimalDepuisLexeme(source.vatRate),
      devise: null,
      actif,
    },
    source,
  };
}

function mapperArticle(brut: unknown, routeId: string, avertissements: string[]): Article {
  return mapperArticleAvecSource(brut, routeId, avertissements).article;
}

function validerSkipTake(skip: number, take: number): void {
  if (!Number.isInteger(take) || take < 1 || take > 100) {
    throw erreurTakeInvalide(take);
  }
  if (!Number.isInteger(skip) || skip < 0) {
    throw erreurSkipInvalide(skip);
  }
}

export interface RequeteListeArticles {
  readonly skip: number;
  readonly take: number;
}

/** Page `/items` normalisée : aucune boucle de pagination, aucun total filtré calculé ici (07 §1). */
export interface PageArticles {
  readonly resultats: Article[];
  readonly total_source: number | null;
  readonly renvoyes: number;
  readonly skip_demande: number;
  readonly skip_renvoye: number;
  readonly avertissements: string[];
  /** Éléments source validés, alignés 1:1 avec `resultats` (D-T11-14, extension additive). */
  readonly sourcesEbp: unknown[];
}

/**
 * Lit une page de `/items` (02 §3). `take` ≤ 100 contrôlé avant tout réseau ; `skip` renvoyé par
 * le fournisseur différent de `skip` demandé ⇒ `UPSTREAM_PAGINATION_INVALID` (07 §5), jamais un
 * redémarrage silencieux à l'offset zéro.
 */
export async function listerArticles(
  deps: DependancesClientHttp,
  budget: Budget,
  contexte: ContexteHttp,
  requete: RequeteListeArticles,
): Promise<PageArticles> {
  validerSkipTake(requete.skip, requete.take);
  const corps = await executerRequetePourRoute(deps, budget, contexte, "gc-items", {
    parametres: { skip: requete.skip, take: requete.take },
  });
  const enveloppe = lireEnveloppeListe("gc-items", corps, requete.skip);
  if (enveloppe.skipRenvoye !== requete.skip) {
    throw erreurPaginationInvalide("gc-items", requete.skip, enveloppe.skipRenvoye);
  }
  const avertissements: string[] = [];
  const sourcesEbp: unknown[] = [];
  const resultats = enveloppe.elements.map((brut) => {
    const { article, source } = mapperArticleAvecSource(brut, "gc-items", avertissements);
    sourcesEbp.push(source);
    return article;
  });
  return {
    resultats,
    total_source: enveloppe.totalSource,
    renvoyes: resultats.length,
    skip_demande: requete.skip,
    skip_renvoye: enveloppe.skipRenvoye,
    avertissements,
    sourcesEbp,
  };
}

export interface FicheArticle {
  readonly resultat: Article;
  readonly avertissements: string[];
  /** Élément source validé (D-T11-14, extension additive), pour `inclure_brut` uniquement. */
  readonly sourceEbp: unknown;
}

async function lireArticleDetail(
  deps: DependancesClientHttp,
  budget: Budget,
  contexte: ContexteHttp,
  routeId: "gc-item-good-detail" | "gc-item-service-detail",
  id: string,
): Promise<FicheArticle> {
  const corps = await executerRequetePourRoute(deps, budget, contexte, routeId, { segments: { id } });
  const fiche = lireFiche(routeId, corps);
  const avertissements: string[] = [];
  const { article, source } = mapperArticleAvecSource(fiche, routeId, avertissements);
  return { resultat: article, avertissements, sourceEbp: source };
}

/**
 * `/items/goods/{id}` (02 §3). Le type doit être fourni par l'appelant (A13, issu d'un résultat
 * de `listerArticles`) : aucun essai de `lireArticleService` après un `NOT_FOUND`.
 */
export function lireArticleBien(
  deps: DependancesClientHttp,
  budget: Budget,
  contexte: ContexteHttp,
  id: string,
): Promise<FicheArticle> {
  return lireArticleDetail(deps, budget, contexte, "gc-item-good-detail", id);
}

/** `/items/services/{id}` (02 §3). Même contrat que `lireArticleBien`, route distincte. */
export function lireArticleService(
  deps: DependancesClientHttp,
  budget: Budget,
  contexte: ContexteHttp,
  id: string,
): Promise<FicheArticle> {
  return lireArticleDetail(deps, budget, contexte, "gc-item-service-detail", id);
}
