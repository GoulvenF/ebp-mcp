import type { LigneEcritureListe } from "../../adapters/compta/ecritures.js";
import { listerLignesEcriture } from "../../adapters/compta/ecritures.js";
import { joursCivilsEntre } from "../../domain/date.js";
import { creerBudget } from "../../http/budget.js";
import type { IdentiteScan } from "../../pagination/scan.js";
import { scanner } from "../../pagination/scan.js";
import { verifierCapacitesEntree } from "../commun/capacites.js";
import { ListerEcrituresEntreeSchema, validerEntree } from "../commun/entrees.js";
import { correspondTexte } from "../commun/texte.js";
import type { ContexteService, DepsService, ResultatService } from "../commun/types.js";
import { exigerFamilleOutil } from "../commun/types.js";
import type { ElementEnveloppe } from "./pagination-skip-take.js";
import { construireSourceSkipTake } from "./pagination-skip-take.js";

const SOURCE_ID = "hubbix-compta:/lines-entries";

/**
 * `lister_ecritures` (D-T11-5) : seuls `startDate`/`endDate`/`generalAccount`/`auxiliaryAccount`/
 * `valid`/`lettered` partent vers l'adapter. Revérification locale stricte de `compte_general`,
 * `compte_tiers`, `date` (dans `[du,au]`) et `mode` (contre `validees`) : un champ `null` côté
 * revérifié ⇒ ligne exclue et comptée, avec un avertissement explicite (jamais silencieux).
 * `lettrees` n'est **pas** revérifié (E07, sémantique booléenne non prouvée en sortie). `texte`
 * et `journaux[]` restent des filtres locaux, jamais envoyés en paramètre serveur.
 */
export async function listerEcritures(
  deps: DepsService,
  ctx: ContexteService,
  entreeBrute: unknown,
): Promise<ResultatService<LigneEcritureListe>> {
  const entree = validerEntree(ListerEcrituresEntreeSchema, entreeBrute, "lister_ecritures");
  exigerFamilleOutil("lister_ecritures", ctx);
  verifierCapacitesEntree("lister_ecritures", ctx.dossier.famille, entree);

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
        ...(entree.du !== undefined ? { startDate: entree.du } : {}),
        ...(entree.au !== undefined ? { endDate: entree.au } : {}),
        ...(entree.compte !== undefined ? { generalAccount: entree.compte } : {}),
        ...(entree.compte_tiers !== undefined ? { auxiliaryAccount: entree.compte_tiers } : {}),
        ...(entree.validees !== undefined ? { valid: entree.validees } : {}),
        ...(entree.lettrees !== undefined ? { lettered: entree.lettrees } : {}),
      }),
  });

  let exclusCompteGeneralAbsent = 0;
  let exclusCompteTiersAbsent = 0;
  let exclusDateAbsente = 0;
  let exclusModeAbsent = 0;

  const filtre = (enveloppe: ElementEnveloppe<LigneEcritureListe>): boolean => {
    const ligne = enveloppe.item;

    if (entree.compte !== undefined) {
      if (ligne.compte_general === null) {
        exclusCompteGeneralAbsent += 1;
        return false;
      }
      if (ligne.compte_general !== entree.compte) {
        return false;
      }
    }

    if (entree.compte_tiers !== undefined) {
      if (ligne.compte_tiers === null) {
        exclusCompteTiersAbsent += 1;
        return false;
      }
      if (ligne.compte_tiers !== entree.compte_tiers) {
        return false;
      }
    }

    if (entree.du !== undefined || entree.au !== undefined) {
      if (ligne.date === null) {
        exclusDateAbsente += 1;
        return false;
      }
      if (entree.du !== undefined && joursCivilsEntre(entree.du, ligne.date) < 0) {
        return false;
      }
      if (entree.au !== undefined && joursCivilsEntre(ligne.date, entree.au) < 0) {
        return false;
      }
    }

    if (entree.validees !== undefined) {
      if (ligne.mode === null) {
        exclusModeAbsent += 1;
        return false;
      }
      const attendu = entree.validees ? "valide" : "provisoire";
      if (ligne.mode !== attendu) {
        return false;
      }
    }

    if (
      entree.texte !== undefined &&
      !correspondTexte(entree.texte, [
        ligne.libelle,
        ligne.piece,
        ligne.document,
        ligne.compte_general,
        ligne.compte_tiers,
      ])
    ) {
      return false;
    }

    if (entree.journaux !== undefined) {
      if (ligne.journal === null || !entree.journaux.includes(ligne.journal)) {
        return false;
      }
    }

    return true;
  };

  const identite: IdentiteScan = {
    outil: "lister_ecritures",
    profil: ctx.execution.profil,
    identiteGeneration: ctx.execution.identiteGeneration,
    environnement: ctx.execution.environnement,
    famille: ctx.dossier.famille,
    dossier: ctx.dossier.id,
    limite: entree.limite,
    filtres: {
      du: entree.du ?? null,
      au: entree.au ?? null,
      compte: entree.compte ?? null,
      compte_tiers: entree.compte_tiers ?? null,
      validees: entree.validees ?? null,
      lettrees: entree.lettrees ?? null,
      texte: entree.texte ?? null,
      journaux: entree.journaux ?? null,
    },
  };

  const resultatScan = await scanner(deps.scan, {
    contexte: ctx.execution,
    source,
    limite: entree.limite,
    ...(entree.curseur !== undefined ? { curseur: entree.curseur } : {}),
    identite,
    filtre,
    budget,
    projeter: (enveloppe) => {
      if (entree.inclure_brut) bruts.push(enveloppe.brutEbp);
      return enveloppe.item;
    },
  });

  const avertissementsRevalidation: string[] = [];
  if (exclusCompteGeneralAbsent > 0) {
    avertissementsRevalidation.push(
      `${exclusCompteGeneralAbsent} ligne(s) exclue(s) : compte_general absent pour la revérification locale.`,
    );
  }
  if (exclusCompteTiersAbsent > 0) {
    avertissementsRevalidation.push(
      `${exclusCompteTiersAbsent} ligne(s) exclue(s) : compte_tiers absent pour la revérification locale.`,
    );
  }
  if (exclusDateAbsente > 0) {
    avertissementsRevalidation.push(
      `${exclusDateAbsente} ligne(s) exclue(s) : date absente pour la revérification locale.`,
    );
  }
  if (exclusModeAbsent > 0) {
    avertissementsRevalidation.push(
      `${exclusModeAbsent} ligne(s) exclue(s) : mode absent pour la revérification locale.`,
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
