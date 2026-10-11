import type { Budget } from "../../http/budget.js";
import type { DocumentVente } from "../../adapters/hubbix-gescom/documents-communs.js";
import { listerDocumentsVente as listerDocumentsVenteAdapter } from "../../adapters/hubbix-gescom/documents.js";
import type { DetailDocumentVente } from "../../adapters/hubbix-gescom/documents-detail.js";
import { lireDetailDocumentVente } from "../../adapters/hubbix-gescom/documents-detail.js";
import { creerBudget } from "../../http/budget.js";
import { joursCivilsEntre } from "../../domain/date.js";
import { scanner } from "../../pagination/scan.js";
import {
  DetailDocumentEntreeSchema,
  ListerDocumentsVenteEntreeSchema,
  validerEntree,
} from "../commun/entrees.js";
import { verifierCapacitesEntree } from "../commun/capacites.js";
import { erreurCapaciteNonSupporteeService } from "../commun/erreurs.js";
import { resoudreUnique } from "../commun/resolution.js";
import { correspondTexte } from "../commun/texte.js";
import { exigerFamilleOutil, type ContexteService, type DepsService, type ResultatService } from "../commun/types.js";
import { identiteScanGescom } from "./identite.js";
import {
  documentCorrespondStatut,
  resoudreTypeStatutSourceDepuisElement,
  resoudreTypeStatutSourceDepuisReference,
  TYPE_SOURCE_VERS_ENTREE,
} from "./mapping.js";
import { resultatServiceDepuisScan, resultatServiceFiche } from "./resultats.js";
import { sourceDepuisSkipTake, sourceDepuisSkipTakeAvecSource, type ElementAvecSource } from "./sources.js";

/** Vue interne d'un candidat document pendant le scan ; jamais rendue telle quelle (champs `_` strippés par `projeter`). */
interface CandidatDocument extends DocumentVente {
  readonly _tiersIdVerifie?: string | null;
  readonly _nonVerifiable?: boolean;
}

function depouillerCandidat(candidat: CandidatDocument): DocumentVente {
  const {
    id,
    type,
    statut,
    tiers_nom,
    tiers_id,
    date,
    numero,
    montant_ht,
    montant_ttc,
    montant_net_ttc,
    devise,
    reste_du,
    statut_comptable,
    lignes,
  } = candidat;
  return {
    id,
    type,
    statut,
    tiers_nom,
    tiers_id,
    date,
    numero,
    montant_ht,
    montant_ttc,
    montant_net_ttc,
    devise,
    reste_du,
    statut_comptable,
    lignes,
  };
}

/**
 * `lister_documents_vente` (07 §6, D-T11-7/D-T11-8). Seuls `skip`/`take` partent au serveur
 * (`/sale-documents`) ; `types`/`statut`/`du`/`au`/`texte` sont des filtres locaux après scan. Avec
 * `tiers`, chaque candidat restant après filtres locaux est enrichi par lecture du détail routé
 * (D-T11-8) : conservé seulement si `detail.tiers_id === tiers` exactement.
 */
export async function listerDocumentsVenteService(
  deps: DepsService,
  ctx: ContexteService,
  entreeBrute: unknown,
): Promise<ResultatService<DocumentVente>> {
  const entree = validerEntree(ListerDocumentsVenteEntreeSchema, entreeBrute, "lister_documents_vente");
  exigerFamilleOutil("lister_documents_vente", ctx);
  verifierCapacitesEntree("lister_documents_vente", ctx.dossier.famille, entree);

  const budget = creerBudget(ctx.execution);
  const source = sourceDepuisSkipTakeAvecSource<CandidatDocument>(
    "hubbix-gescom:/sale-documents",
    "transactionnel",
    100,
    (document) => document.id,
    async (skip, take, b) => {
      const page = await listerDocumentsVenteAdapter(deps.http, b, ctx.http, { skip, take });
      return {
        resultats: page.resultats,
        total_source: page.total_source,
        renvoyes: page.renvoyes,
        skip_renvoye: page.skip_renvoye,
        sourcesEbp: page.sourcesEbp,
      };
    },
  );

  const typesEntree = entree.types !== undefined ? new Set<string>(entree.types) : null;

  const filtre = (element: ElementAvecSource<CandidatDocument>): boolean => {
    const document = element.objet;
    if (typesEntree !== null) {
      if (document.type === "inconnu") return false;
      const typeEntree = TYPE_SOURCE_VERS_ENTREE.get(document.type);
      if (typeEntree === undefined || !typesEntree.has(typeEntree)) return false;
    }
    if (entree.statut !== undefined) {
      if (document.statut === "inconnu") return false;
      if (!documentCorrespondStatut(entree.statut, document)) return false;
    }
    if (entree.du !== undefined && (document.date === null || joursCivilsEntre(entree.du, document.date) < 0)) return false;
    if (entree.au !== undefined && (document.date === null || joursCivilsEntre(document.date, entree.au) < 0)) return false;
    if (entree.texte !== undefined && !correspondTexte(entree.texte, [document.tiers_nom, document.numero])) return false;
    return true;
  };

  let lecturesDetail = 0;
  let nonVerifiables = 0;

  const enrichir =
    entree.tiers === undefined
      ? undefined
      : async (element: ElementAvecSource<CandidatDocument>, b: Budget): Promise<ElementAvecSource<CandidatDocument>> => {
          const candidat = element.objet;
          const route = resoudreTypeStatutSourceDepuisElement(candidat);
          if (route === null) {
            nonVerifiables += 1;
            return { ...element, objet: { ...candidat, _nonVerifiable: true } };
          }
          const fiche = await lireDetailDocumentVente(deps.http, b, ctx.http, route.documentType, route.documentStatus, candidat.id);
          lecturesDetail += 1;
          return { ...element, objet: { ...candidat, _tiersIdVerifie: fiche.resultat.tiers_id } };
        };

  const filtreApresEnrichissement =
    entree.tiers === undefined
      ? undefined
      : (element: ElementAvecSource<CandidatDocument>): boolean => {
          const candidat = element.objet;
          if (candidat._nonVerifiable === true || candidat._tiersIdVerifie === undefined || candidat._tiersIdVerifie === null) {
            if (candidat._tiersIdVerifie === null) nonVerifiables += 1;
            return false;
          }
          return candidat._tiersIdVerifie === entree.tiers;
        };

  const projeter = (element: ElementAvecSource<CandidatDocument>): { objet: DocumentVente; source: unknown } => ({
    objet: depouillerCandidat(element.objet),
    source: element.source,
  });

  const resultat = await scanner<ElementAvecSource<CandidatDocument>, { objet: DocumentVente; source: unknown }>(deps.scan, {
    contexte: ctx.execution,
    budget,
    source,
    limite: entree.limite,
    identite: identiteScanGescom(ctx, "lister_documents_vente", entree.limite, {
      types: entree.types ?? null,
      statut: entree.statut ?? null,
      du: entree.du ?? null,
      au: entree.au ?? null,
      tiers: entree.tiers ?? null,
      texte: entree.texte ?? null,
    }),
    filtre,
    ...(enrichir !== undefined ? { enrichir } : {}),
    ...(filtreApresEnrichissement !== undefined ? { filtreApresEnrichissement } : {}),
    projeter,
    ...(entree.curseur !== undefined ? { curseur: entree.curseur } : {}),
  });

  const resultats = resultat.resultats.map((r) => r.objet);
  let approximatif = resultat.approximatif;
  let completude = resultat.completude;
  let raisonArret = resultat.raisonArret;
  const avertissements = [...resultat.avertissements];
  if (nonVerifiables > 0) {
    approximatif = true;
    if (completude !== "partielle") {
      completude = "partielle";
      raisonArret = "source_incomplete";
    }
    avertissements.push(
      `${nonVerifiables} document(s) non vérifiable(s) pour le filtre \`tiers\` (identifiant tiers absent ou document non routable) : exclu(s).`,
    );
  }
  if (entree.tiers !== undefined) {
    avertissements.push(`${lecturesDetail} lecture(s) de détail effectuée(s) pour vérifier le filtre \`tiers\`.`);
  }

  const bruts = entree.inclure_brut ? resultat.resultats.map((r) => r.source) : null;
  return resultatServiceDepuisScan(
    ctx,
    budget.restant,
    { ...resultat, resultats, approximatif, completude, raisonArret, avertissements },
    bruts,
  );
}

/**
 * `detail_document` (07 §6, D-T11-7). `reference{id,type,statut}` ⇒ route directe (404 ⇒
 * `NOT_FOUND`, aucun essai d'une autre route). `numero` ⇒ résolution D-T11-3 sur
 * `/sale-documents`, puis route selon le type/statut **source** de l'élément trouvé (non routable
 * ⇒ `UNSUPPORTED_CAPABILITY`). `avec_lignes: false` ⇒ `lignes: null`, même appel unique.
 */
export async function detailDocument(
  deps: DepsService,
  ctx: ContexteService,
  entreeBrute: unknown,
): Promise<ResultatService<DetailDocumentVente>> {
  const entree = validerEntree(DetailDocumentEntreeSchema, entreeBrute, "detail_document");
  exigerFamilleOutil("detail_document", ctx);
  verifierCapacitesEntree("detail_document", ctx.dossier.famille, entree);

  const budget = creerBudget(ctx.execution);
  const sources: string[] = [];
  let appelsSource = 0;
  let documentType: unknown;
  let documentStatus: unknown;
  let id: string;

  if (entree.reference !== undefined) {
    const route = resoudreTypeStatutSourceDepuisReference(entree.reference.type, entree.reference.statut);
    documentType = route.documentType;
    documentStatus = route.documentStatus;
    id = entree.reference.id;
  } else {
    const numero = entree.numero as string;
    const sourceListe = sourceDepuisSkipTake<DocumentVente>(
      "hubbix-gescom:/sale-documents",
      "transactionnel",
      2,
      (document) => document.id,
      async (skip, take, b) => {
        appelsSource += 1;
        const page = await listerDocumentsVenteAdapter(deps.http, b, ctx.http, { skip, take });
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
      identite: identiteScanGescom(ctx, "detail_document", 2, { numero }),
      correspond: (document) => document.numero === numero,
    });
    const route = resoudreTypeStatutSourceDepuisElement(trouve);
    if (route === null) {
      throw erreurCapaciteNonSupporteeService(
        "detail_document",
        "numero",
        "Type ou statut de document non routable en v0.1 (détail indéterminable).",
        { id: trouve.id, type: trouve.type, statut: trouve.statut },
      );
    }
    documentType = route.documentType;
    documentStatus = route.documentStatus;
    id = trouve.id;
    sources.push("hubbix-gescom:/sale-documents");
  }

  const fiche = await lireDetailDocumentVente(deps.http, budget, ctx.http, documentType, documentStatus, id);
  appelsSource += 1;
  sources.push("hubbix-gescom:/sale-documents/{detail}");

  const resultat = entree.avec_lignes ? fiche.resultat : { ...fiche.resultat, lignes: null };

  return resultatServiceFiche(ctx, budget.restant, resultat, entree.inclure_brut ? fiche.sourceEbp : null, {
    sources,
    appelsSource,
    avertissements: fiche.avertissements,
  });
}
