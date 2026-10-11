import type { LigneEcritureListe } from "../../adapters/compta/ecritures.js";
import { listerLignesEcriture } from "../../adapters/compta/ecritures.js";
import { joursCivilsEntre } from "../../domain/date.js";
import type { LigneGrandLivreSchema } from "../../domain/schemas/compta.js";
import { creerBudget } from "../../http/budget.js";
import type { IdentiteScan } from "../../pagination/scan.js";
import { scanner } from "../../pagination/scan.js";
import { verifierCapacitesEntree } from "../commun/capacites.js";
import { GrandLivreEntreeSchema, validerEntree } from "../commun/entrees.js";
import type { ContexteService, DepsService, ResultatService } from "../commun/types.js";
import { exigerFamilleOutil } from "../commun/types.js";
import type { ElementEnveloppe } from "./pagination-skip-take.js";
import { construireSourceSkipTake } from "./pagination-skip-take.js";
import type { z } from "zod";

type LigneGrandLivre = z.infer<typeof LigneGrandLivreSchema>;

const SOURCE_ID = "hubbix-compta:/lines-entries";

/**
 * `grand_livre` (D-T11-13, D-T11-5) : `/lines-entries` avec `generalAccount`/`startDate`/`endDate` ;
 * revérification EXACTE locale de `compte_general === compte` et de `date` dans `[du, au]`. Liste
 * paginée normale (`limite`/`curseur`), **aucun cumul ni solde progressif** : chaque ligne reste
 * indépendante, pas de solde d'ouverture implicite. `compte_general: null` (D-T11-5) et
 * `date: null` sont chacun exclus, comptés et signalés par avertissement, jamais silencieux.
 */
export async function grandLivre(
  deps: DepsService,
  ctx: ContexteService,
  entreeBrute: unknown,
): Promise<ResultatService<LigneGrandLivre>> {
  const entree = validerEntree(GrandLivreEntreeSchema, entreeBrute, "grand_livre");
  exigerFamilleOutil("grand_livre", ctx);
  verifierCapacitesEntree("grand_livre", ctx.dossier.famille, entree);

  const budget = creerBudget(ctx.execution);
  const budgetInitial = budget.restant;
  const avertissementsSource: string[] = [];
  const bruts: unknown[] = [];

  const source = construireSourceSkipTake<LigneEcritureListe>({
    id: SOURCE_ID,
    nature: "transactionnel",
    idDe: (ligne) => ligne.id,
    avertissements: avertissementsSource,
    lirePage: (skip, take, budgetAppel) =>
      listerLignesEcriture(deps.http, budgetAppel, ctx.http, {
        skip,
        take,
        startDate: entree.du,
        endDate: entree.au,
        generalAccount: entree.compte,
      }),
  });

  let exclusCompteGeneralAbsent = 0;
  let exclusDateAbsente = 0;

  const filtre = (enveloppe: ElementEnveloppe<LigneEcritureListe>): boolean => {
    const ligne = enveloppe.item;
    if (ligne.compte_general === null) {
      // D-T11-5 : champ revérifié absent ⇒ exclu, compté, signalé (jamais silencieux).
      exclusCompteGeneralAbsent += 1;
      return false;
    }
    if (ligne.compte_general !== entree.compte) {
      // Revérification exacte (D-T11-13).
      return false;
    }
    if (ligne.date === null) {
      exclusDateAbsente += 1;
      return false;
    }
    if (joursCivilsEntre(entree.du, ligne.date) < 0 || joursCivilsEntre(ligne.date, entree.au) < 0) {
      // Revérification locale dans [du, au] (D-T11-5) : le filtre serveur `startDate`/`endDate`
      // n'est jamais la seule garantie.
      return false;
    }
    return true;
  };

  const identite: IdentiteScan = {
    outil: "grand_livre",
    profil: ctx.execution.profil,
    identiteGeneration: ctx.execution.identiteGeneration,
    environnement: ctx.execution.environnement,
    famille: ctx.dossier.famille,
    dossier: ctx.dossier.id,
    limite: entree.limite,
    filtres: { compte: entree.compte, du: entree.du, au: entree.au },
  };

  const resultatScan = await scanner(deps.scan, {
    contexte: ctx.execution,
    source,
    limite: entree.limite,
    ...(entree.curseur !== undefined ? { curseur: entree.curseur } : {}),
    identite,
    filtre,
    budget,
    projeter: (enveloppe): LigneGrandLivre => {
      if (entree.inclure_brut) bruts.push(enveloppe.brutEbp);
      const ligne = enveloppe.item;
      return {
        id: ligne.id,
        compte: ligne.compte_general as string,
        date: ligne.date as string,
        journal: ligne.journal,
        libelle: ligne.libelle,
        piece: ligne.piece,
        debit: ligne.debit,
        credit: ligne.credit,
        lettrage: ligne.lettrage,
      };
    },
  });

  const avertissementsRevalidation: string[] = [];
  if (exclusCompteGeneralAbsent > 0) {
    avertissementsRevalidation.push(
      `${exclusCompteGeneralAbsent} ligne(s) exclue(s) : compte_general absent pour la revérification locale.`,
    );
  }
  if (exclusDateAbsente > 0) {
    avertissementsRevalidation.push(
      `${exclusDateAbsente} ligne(s) exclue(s) : date absente pour la revérification locale.`,
    );
  }

  return {
    dossier: ctx.dossier.id,
    resultats: resultatScan.resultats,
    bruts: entree.inclure_brut ? bruts : null,
    pagination: resultatScan.pagination,
    completude: resultatScan.completude,
    raison_arret: resultatScan.raisonArret,
    approximatif: resultatScan.approximatif,
    avertissements: [...avertissementsSource, ...avertissementsRevalidation, ...resultatScan.avertissements],
    sources: resultatScan.sources,
    appels_source: resultatScan.appelsSource,
    tentatives: budgetInitial - budget.restant,
  };
}
