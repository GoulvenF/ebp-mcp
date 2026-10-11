import type { Article } from "../../adapters/hubbix-gescom/articles.js";
import { lireArticleBien, lireArticleService, listerArticles } from "../../adapters/hubbix-gescom/articles.js";
import { creerBudget } from "../../http/budget.js";
import { scanner } from "../../pagination/scan.js";
import {
  FicheArticleEntreeSchema,
  RechercherArticlesEntreeSchema,
  validerEntree,
} from "../commun/entrees.js";
import { verifierCapacitesEntree } from "../commun/capacites.js";
import { erreurCapaciteNonSupporteeService } from "../commun/erreurs.js";
import { resoudreUnique } from "../commun/resolution.js";
import { correspondTexte } from "../commun/texte.js";
import { exigerFamilleOutil, type ContexteService, type DepsService, type ResultatService } from "../commun/types.js";
import { identiteScanGescom } from "./identite.js";
import { resultatServiceDepuisScan, resultatServiceFiche } from "./resultats.js";
import { sourceDepuisSkipTake, sourceDepuisSkipTakeAvecSource, type ElementAvecSource } from "./sources.js";

/**
 * `rechercher_articles` (07 §6, D-T11-4/D-T11-6). Seuls `skip`/`take` partent au serveur (`/items`,
 * 02 §3) ; `texte`/`type`/`actif` sont des filtres locaux après scan. `avec_stock: true` est déjà
 * refusé avant réseau par `verifierCapacitesEntree` (manifeste `commun/capacites.ts`).
 */
export async function rechercherArticles(
  deps: DepsService,
  ctx: ContexteService,
  entreeBrute: unknown,
): Promise<ResultatService<Article>> {
  const entree = validerEntree(RechercherArticlesEntreeSchema, entreeBrute, "rechercher_articles");
  exigerFamilleOutil("rechercher_articles", ctx);
  verifierCapacitesEntree("rechercher_articles", ctx.dossier.famille, entree);

  const budget = creerBudget(ctx.execution);
  const source = sourceDepuisSkipTakeAvecSource<Article>(
    "hubbix-gescom:/items",
    "referentiel",
    100,
    (article) => article.id,
    async (skip, take, b) => {
      const page = await listerArticles(deps.http, b, ctx.http, { skip, take });
      return {
        resultats: page.resultats,
        total_source: page.total_source,
        renvoyes: page.renvoyes,
        skip_renvoye: page.skip_renvoye,
        sourcesEbp: page.sourcesEbp,
      };
    },
  );

  const filtre = (element: ElementAvecSource<Article>): boolean => {
    const article = element.objet;
    if (entree.type !== undefined && article.type !== entree.type) return false;
    if (entree.actif !== undefined && article.actif !== entree.actif) return false;
    if (entree.texte !== undefined && !correspondTexte(entree.texte, [article.code, article.libelle])) return false;
    return true;
  };

  const projeter = (element: ElementAvecSource<Article>): { objet: Article; source: unknown } => ({
    objet: element.objet,
    source: element.source,
  });

  const resultat = await scanner<ElementAvecSource<Article>, { objet: Article; source: unknown }>(deps.scan, {
    contexte: ctx.execution,
    budget,
    source,
    limite: entree.limite,
    identite: identiteScanGescom(ctx, "rechercher_articles", entree.limite, {
      texte: entree.texte ?? null,
      type: entree.type ?? null,
      actif: entree.actif ?? null,
    }),
    filtre,
    projeter,
    ...(entree.curseur !== undefined ? { curseur: entree.curseur } : {}),
  });

  const resultats = resultat.resultats.map((r) => r.objet);
  const bruts = entree.inclure_brut ? resultat.resultats.map((r) => r.source) : null;
  return resultatServiceDepuisScan(ctx, budget.restant, { ...resultat, resultats }, bruts);
}

/**
 * `fiche_article` (07 §6, D-T11-3). `reference{id,type}` ⇒ route directe. `code` ⇒ résolution par
 * scan exact sur `/items` (`sansCurseur: true`, `limite: 2`), puis détail routé par le `type` de
 * l'élément trouvé (`inconnu` ⇒ `UNSUPPORTED_CAPABILITY`, aucune requête supplémentaire).
 */
export async function ficheArticle(
  deps: DepsService,
  ctx: ContexteService,
  entreeBrute: unknown,
): Promise<ResultatService<Article>> {
  const entree = validerEntree(FicheArticleEntreeSchema, entreeBrute, "fiche_article");
  exigerFamilleOutil("fiche_article", ctx);
  verifierCapacitesEntree("fiche_article", ctx.dossier.famille, entree);

  const budget = creerBudget(ctx.execution);

  let id: string;
  let type: Article["type"];
  const sources: string[] = [];
  let appelsSource = 0;

  if (entree.reference !== undefined) {
    id = entree.reference.id;
    type = entree.reference.type;
  } else {
    const code = entree.code as string;
    const sourceListe = sourceDepuisSkipTake<Article>(
      "hubbix-gescom:/items",
      "referentiel",
      2,
      (article) => article.id,
      async (skip, take, b) => {
        appelsSource += 1;
        const page = await listerArticles(deps.http, b, ctx.http, { skip, take });
        return {
          resultats: page.resultats,
          total_source: page.total_source,
          renvoyes: page.renvoyes,
          skip_renvoye: page.skip_renvoye,
        };
      },
    );
    const trouve = await resoudreUnique(deps.scan, {
      contexte: ctx.execution,
      budget,
      source: sourceListe,
      identite: identiteScanGescom(ctx, "fiche_article", 2, { code }),
      correspond: (article) => article.code === code,
    });
    id = trouve.id;
    type = trouve.type;
    sources.push("hubbix-gescom:/items");
  }

  if (type === "inconnu") {
    throw erreurCapaciteNonSupporteeService(
      "fiche_article",
      "reference.type",
      "Type d'article inconnu : route de détail indéterminable en v0.1 (ni bien ni service).",
      { id },
    );
  }

  const fiche = type === "bien"
    ? await lireArticleBien(deps.http, budget, ctx.http, id)
    : await lireArticleService(deps.http, budget, ctx.http, id);
  appelsSource += 1;
  sources.push(type === "bien" ? "hubbix-gescom:/items/goods/{id}" : "hubbix-gescom:/items/services/{id}");

  return resultatServiceFiche(ctx, budget.restant, fiche.resultat, entree.inclure_brut ? fiche.sourceEbp : null, {
    sources,
    appelsSource,
    avertissements: fiche.avertissements,
  });
}
