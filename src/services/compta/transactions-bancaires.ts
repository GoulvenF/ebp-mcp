import type { TransactionBancaire } from "../../adapters/compta/banque.js";
import { listerTransactionsBancaires } from "../../adapters/compta/banque.js";
import { creerCompteurOccurrences, idLigneLocale } from "../../adapters/compta/lignes.js";
import { joursCivilsEntre } from "../../domain/date.js";
import { creerBudget } from "../../http/budget.js";
import type { IdentiteScan } from "../../pagination/scan.js";
import { scanner } from "../../pagination/scan.js";
import { verifierCapacitesEntree } from "../commun/capacites.js";
import { TransactionsBancairesEntreeSchema, validerEntree } from "../commun/entrees.js";
import type { ContexteService, DepsService, ResultatService } from "../commun/types.js";
import { exigerFamilleOutil } from "../commun/types.js";
import type { ElementEnveloppe } from "./pagination-skip-take.js";
import { construireSourceSkipTake } from "./pagination-skip-take.js";

const SOURCE_ID = "hubbix-compta:/bank-transactions";

/**
 * `transactions_bancaires` (D-T11-5) : seuls `startDate`/`endDate` partent vers l'adapter (`statut`
 * est déjà refusé avant réseau par `verifierCapacitesEntree`, D-T11-6 ; il n'existe d'ailleurs
 * aucun paramètre de filtre statut/compte côté adapter). Revérification locale stricte de
 * `date_operation` dans `[du,au]` (exclusion + avertissement si `null`) ; `compte` (IBAN), si
 * fourni, filtré par égalité EXACTE locale sur `compte_bancaire`, sans normalisation. `debit`/
 * `credit` `null` conservés tels quels (jamais convertis en `0`).
 */
export async function transactionsBancaires(
  deps: DepsService,
  ctx: ContexteService,
  entreeBrute: unknown,
): Promise<ResultatService<TransactionBancaire>> {
  const entree = validerEntree(TransactionsBancairesEntreeSchema, entreeBrute, "transactions_bancaires");
  exigerFamilleOutil("transactions_bancaires", ctx);
  verifierCapacitesEntree("transactions_bancaires", ctx.dossier.famille, entree);

  const budget = creerBudget(ctx.execution);
  const budgetInitial = budget.restant;
  const avertissementsSource: string[] = [];
  const bruts: unknown[] = [];
  const rangDe = creerCompteurOccurrences();

  const source = construireSourceSkipTake<TransactionBancaire>({
    id: SOURCE_ID,
    nature: "transactionnel",
    // Aucune identité EBP documentée pour cette route (banque.ts : `id` toujours `null`) ; identité
    // locale dérivée du contenu, même convention que les lignes d'écriture (D-T09-2), jamais
    // réexposée en sortie.
    idDe: (transaction) => idLigneLocale(transaction, rangDe(transaction)),
    avertissements: avertissementsSource,
    lirePage: (skip, take, budgetAppel) =>
      listerTransactionsBancaires(deps.http, budgetAppel, ctx.http, {
        skip,
        take,
        startDate: entree.du,
        endDate: entree.au,
      }),
  });

  let exclusDateAbsente = 0;

  const filtre = (enveloppe: ElementEnveloppe<TransactionBancaire>): boolean => {
    const transaction = enveloppe.item;
    if (transaction.date_operation === null) {
      exclusDateAbsente += 1;
      return false;
    }
    if (joursCivilsEntre(entree.du, transaction.date_operation) < 0) {
      return false;
    }
    if (joursCivilsEntre(transaction.date_operation, entree.au) < 0) {
      return false;
    }
    if (entree.compte !== undefined && transaction.compte_bancaire !== entree.compte) {
      return false;
    }
    return true;
  };

  const identite: IdentiteScan = {
    outil: "transactions_bancaires",
    profil: ctx.execution.profil,
    identiteGeneration: ctx.execution.identiteGeneration,
    environnement: ctx.execution.environnement,
    famille: ctx.dossier.famille,
    dossier: ctx.dossier.id,
    limite: entree.limite,
    filtres: { du: entree.du, au: entree.au, compte: entree.compte ?? null },
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
  if (exclusDateAbsente > 0) {
    avertissementsRevalidation.push(
      `${exclusDateAbsente} transaction(s) exclue(s) : date_operation absente pour la revérification locale.`,
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
