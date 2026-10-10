import type { LigneEcritureListe } from "../../adapters/compta/ecritures.js";
import { listerLignesEcriture } from "../../adapters/compta/ecritures.js";
import { creerBudget, type Budget } from "../../http/budget.js";
import { decimalAdd, decimalCompare, decimalNegate, decimalSubtract, type DecimalString } from "../../domain/decimal.js";
import { parcourir } from "../../pagination/agregat.js";
import type { PageSource, PositionSource, SourcePaginee } from "../../pagination/source-page.js";
import { BalanceComptesEntreeSchema, validerEntree } from "../commun/entrees.js";
import { verifierCapacitesEntree } from "../commun/capacites.js";
import type { ContexteService, DepsService, ResultatService } from "../commun/types.js";
import { exigerFamilleOutil } from "../commun/types.js";

/**
 * Ligne de balance par compte (D-T11-12, 07 §8). `devise` reste `null` : aucune devise prouvée au
 * niveau de `/lines-entries` (02 §2). `incomplet: true` quand au moins une ligne de **ce compte**
 * a été exclue des totaux (deux côtés débit/crédit `null`) — ne reflète pas un arrêt du parcours
 * global, voir `completude`/`raison_arret` du résultat `balance_comptes`.
 */
export interface LigneBalance {
  readonly compte: string;
  readonly debit: DecimalString;
  readonly credit: DecimalString;
  readonly solde: DecimalString;
  readonly solde_debiteur: DecimalString;
  readonly solde_crediteur: DecimalString;
  readonly devise: null;
  readonly lignes: number;
  readonly incomplet: boolean;
}

/**
 * Résultat unique de `balance_comptes` (D-T11-12, 07 §8). Jamais de champ d'équilibre ni de total
 * général présenté comme bilan, partiel ou non — aucune somme de soldes absolus n'est calculée.
 */
export interface ResultatBalanceComptes {
  readonly du: string;
  readonly au: string;
  readonly perimetre: {
    readonly classe: string | null;
    readonly comptes: readonly string[] | null;
    readonly statuts: string;
  };
  readonly comptes: readonly LigneBalance[];
  readonly lignes_parcourues: number;
  readonly lignes_exclues: number;
  readonly devise: null;
}

const STATUTS_DECLARATION = "tous les statuts retournés par la source";

const AVERT_DEVISE =
  "Devise non prouvée pour `/lines-entries` (02 §2) : `devise` renvoyé à `null` pour chaque compte et pour l'ensemble du résultat.";

const AVERT_REDUIRE_PERIODE =
  "Parcours de balance interrompu avant la fin de la période demandée : réduire la période pour obtenir un résultat complet.";

const AVERT_BRUT_NON_SUPPORTE =
  "`inclure_brut` non supporté pour `balance_comptes` (agrégat, D-T11-14, 07 §7) : `bruts` reste à `null`.";

/** Taille de page demandée à `/lines-entries` (≤ 100, 07 §5), utilisée pour déduire la fin de source via `renvoyes < take`. */
const TAILLE_PAGE = 100;

/**
 * Appartenance au périmètre `classe`/`comptes` (D-T11-11), appliquée **avant** tout traitement
 * métier : sans filtre, tout est dans le périmètre (y compris une ligne sans `compte_general`,
 * traitée ensuite comme orpheline par D-T11-12) ; avec un filtre, une ligne sans `compte_general`
 * ne peut être rattachée à aucun compte et est exclue du périmètre, jamais comptée ni rendue
 * approximative pour cette seule raison.
 */
function dansPerimetre(compteGeneral: string | null, classe: string | null, comptes: readonly string[] | null): boolean {
  if (classe === null && comptes === null) {
    return true;
  }
  if (compteGeneral === null) {
    return false;
  }
  if (classe !== null) {
    return compteGeneral.charAt(0) === classe;
  }
  return (comptes as readonly string[]).includes(compteGeneral);
}

/**
 * Source paginée `/lines-entries` pour le parcours d'agrégat (D-T11-12) : position = `{skip}`,
 * page suivante déduite de `renvoyes < take` (aucun total documenté à ce niveau, 02 §2). Les
 * avertissements de mapping de l'adapter (montant illisible, mode inconnu, UUID non documenté…)
 * sont accumulés dans `avertissementsAdapter` pour être dédupliqués et rendus une seule fois.
 */
function creerSourceLignesEcriture(
  deps: DepsService,
  ctx: ContexteService,
  filtres: { readonly du: string; readonly au: string },
  avertissementsAdapter: string[],
): SourcePaginee<LigneEcritureListe> {
  return {
    id: "hubbix-compta:/lines-entries",
    nature: "transactionnel",
    taillePage: TAILLE_PAGE,
    async lirePage(position: PositionSource, budget: Budget): Promise<PageSource<LigneEcritureListe>> {
      const skip = typeof position?.skip === "number" ? position.skip : 0;
      const page = await listerLignesEcriture(deps.http, budget, ctx.http, {
        skip,
        take: TAILLE_PAGE,
        startDate: filtres.du,
        endDate: filtres.au,
      });
      avertissementsAdapter.push(...page.avertissements);
      const suivant: PositionSource = page.renvoyes === TAILLE_PAGE ? { skip: skip + TAILLE_PAGE } : null;
      return { elements: page.resultats, suivant, totalSource: page.total_source };
    },
    idElement(element: LigneEcritureListe): string {
      return element.id;
    },
  };
}

/** `max(valeur, 0)` décimal (D-T11-12), sans jamais passer par `number`. */
function decimalMax0(valeur: DecimalString): DecimalString {
  return decimalCompare(valeur, "0") > 0 ? valeur : "0";
}

interface SeauCompte {
  compte: string;
  debit: DecimalString;
  credit: DecimalString;
  lignes: number;
  incomplet: boolean;
}

/**
 * `balance_comptes` (D-T11-11/D-T11-12, 07 §6/§8) : agrégat des mouvements CPT sur `[du, au]`,
 * sans solde d'ouverture implicite. Ordre 07 §4 : schéma → famille/capacités → parcours.
 */
export async function balanceComptes(
  deps: DepsService,
  ctx: ContexteService,
  entree: unknown,
): Promise<ResultatService<ResultatBalanceComptes>> {
  const entreeValidee = validerEntree(BalanceComptesEntreeSchema, entree, "balance_comptes");
  exigerFamilleOutil("balance_comptes", ctx);
  verifierCapacitesEntree("balance_comptes", ctx.dossier.famille, entreeValidee);

  const budget = creerBudget(ctx.execution);
  const budgetInitial = budget.restant;

  const classe = entreeValidee.classe ?? null;
  const comptes = entreeValidee.comptes ?? null;

  const avertissementsAdapter: string[] = [];
  const source = creerSourceLignesEcriture(deps, ctx, { du: entreeValidee.du, au: entreeValidee.au }, avertissementsAdapter);

  const buckets = new Map<string, SeauCompte>();
  let lignesExclues = 0;

  const resultatParcours = await parcourir(deps.scan, {
    contexte: ctx.execution,
    budget,
    source,
    identite: {
      outil: "balance_comptes",
      profil: ctx.execution.profil,
      identiteGeneration: ctx.execution.identiteGeneration,
      environnement: ctx.execution.environnement,
      famille: ctx.dossier.famille,
      dossier: ctx.dossier.id,
      filtres: { du: entreeValidee.du, au: entreeValidee.au, classe, comptes },
    },
    filtre: (ligne) => dansPerimetre(ligne.compte_general, classe, comptes),
    surElement: (ligne) => {
      if (ligne.compte_general === null) {
        // Orpheline (D-T11-12) : aucun compte à rattacher, jamais comptée dans un seau.
        lignesExclues += 1;
        return;
      }
      let seau = buckets.get(ligne.compte_general);
      if (seau === undefined) {
        seau = { compte: ligne.compte_general, debit: "0", credit: "0", lignes: 0, incomplet: false };
        buckets.set(ligne.compte_general, seau);
      }
      seau.lignes += 1;
      if (ligne.debit === null && ligne.credit === null) {
        // Deux côtés null (D-T11-12, couvre aussi un montant invalide : déjà réduit à `null` par l'adapter).
        seau.incomplet = true;
        lignesExclues += 1;
        return;
      }
      // Côté `null` unique = côté inutilisé, ne contribue pas (D-T11-12).
      seau.debit = decimalAdd(seau.debit, ligne.debit ?? "0");
      seau.credit = decimalAdd(seau.credit, ligne.credit ?? "0");
    },
  });

  const comptesTries: LigneBalance[] = [...buckets.values()]
    .sort((a, b) => (a.compte < b.compte ? -1 : a.compte > b.compte ? 1 : 0))
    .map((seau): LigneBalance => {
      const solde = decimalSubtract(seau.debit, seau.credit);
      return {
        compte: seau.compte,
        debit: seau.debit,
        credit: seau.credit,
        solde,
        solde_debiteur: decimalMax0(solde),
        solde_crediteur: decimalMax0(decimalNegate(solde)),
        devise: null,
        lignes: seau.lignes,
        incomplet: seau.incomplet,
      };
    });

  const avertissements: string[] = [];
  for (const avertissement of avertissementsAdapter) {
    if (!avertissements.includes(avertissement)) {
      avertissements.push(avertissement);
    }
  }
  avertissements.push(...resultatParcours.avertissements);

  let completude = resultatParcours.completude;
  let raisonArret = resultatParcours.raisonArret;
  let approximatif = resultatParcours.approximatif;

  if (completude === "partielle") {
    avertissements.push(AVERT_REDUIRE_PERIODE);
  }

  if (lignesExclues > 0) {
    approximatif = true;
    if (completude === "complete") {
      completude = "partielle";
      raisonArret = "source_incomplete";
    }
    avertissements.push(`${lignesExclues} ligne(s) exclue(s) des totaux : compte ou montant non exploitable.`);
  }

  avertissements.push(AVERT_DEVISE);

  if (entreeValidee.inclure_brut) {
    avertissements.push(AVERT_BRUT_NON_SUPPORTE);
  }

  const resultatBalance: ResultatBalanceComptes = {
    du: entreeValidee.du,
    au: entreeValidee.au,
    perimetre: { classe, comptes, statuts: STATUTS_DECLARATION },
    comptes: comptesTries,
    lignes_parcourues: resultatParcours.elementsParcourus,
    lignes_exclues: lignesExclues,
    devise: null,
  };

  return {
    dossier: ctx.dossier.alias,
    resultats: [resultatBalance],
    bruts: null,
    pagination: null,
    completude,
    raison_arret: raisonArret,
    approximatif,
    avertissements,
    sources: resultatParcours.sources,
    appels_source: resultatParcours.appelsSource,
    tentatives: budgetInitial - budget.restant,
  };
}
