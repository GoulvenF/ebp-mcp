import type { z } from "zod";
import type { Budget } from "../../http/budget.js";
import type { ContexteHttp, DependancesClientHttp } from "../../http/client.js";
import { executerRequetePourRoute } from "../../http/client.js";
import { interpreterEnum } from "../../domain/enum.js";
import { EcritureSchema, LigneEcritureListeSchema, LigneEcritureSchema } from "../../domain/schemas/compta.js";
import { verifierCapaciteSupportee } from "./capacites.js";
import { creerCompteurOccurrences, idLigneLocale, montantDepuisSource } from "./lignes.js";
import { lireEnveloppeLinesEntries, lireEnveloppeTableauNuCompta, lireFicheCompta } from "./enveloppe.js";
import { erreurEnveloppeInattendueCompta, erreurSkipInvalideCompta, erreurTakeInvalideCompta } from "./errors.js";
import {
  EntryDetailEbpSchema,
  LinesEntryEbpSchema,
  SearchEntriesLineEbpSchema,
} from "./schemas-ebp.js";

export type LigneEcritureListe = z.infer<typeof LigneEcritureListeSchema>;
export type LigneEcriture = z.infer<typeof LigneEcritureSchema>;
export type Ecriture = z.infer<typeof EcritureSchema>;

/** `entryMode` (02 §2) : `Provisoire` \| `Validé` (D-T09-6). */
const MODES_SOURCE = ["Provisoire", "Validé"] as const;

function mapperMode(valeurSource: unknown): {
  mode: "provisoire" | "valide" | "inconnu" | null;
  avertissement: string | null;
} {
  if (valeurSource === null || valeurSource === undefined) {
    return { mode: null, avertissement: null };
  }
  const resultat = interpreterEnum(valeurSource, MODES_SOURCE);
  if (resultat.valeur === "inconnu") {
    return { mode: "inconnu", avertissement: resultat.avertissement };
  }
  return { mode: resultat.valeur === "Provisoire" ? "provisoire" : "valide", avertissement: null };
}

const AVERT_ECRITURE_NON_IDENTIFIEE_LINES_ENTRIES =
  "/lines-entries ne documente aucun UUID d'écriture (02 §2) : `ecriture_id` laissé à null pour toutes les lignes de cette réponse (D-T09-1).";
const AVERT_ECRITURE_NON_IDENTIFIEE_SEARCH_ENTRIES =
  "/search-entries/entries ne documente aucun UUID d'écriture (02 §2) : `ecriture_id` laissé à null pour toutes les lignes de cette réponse (D-T09-1).";

function validerSkipTake(skip: number, take: number): void {
  if (!Number.isInteger(take) || take < 1 || take > 100) {
    throw erreurTakeInvalideCompta(take);
  }
  if (!Number.isInteger(skip) || skip < 0) {
    throw erreurSkipInvalideCompta(skip);
  }
}

export interface RequeteListeLignesEcriture {
  readonly skip: number;
  readonly take: number;
  readonly startDate?: string;
  readonly endDate?: string;
  readonly generalAccount?: string;
  readonly auxiliaryAccount?: string;
  readonly valid?: boolean;
  readonly lettered?: boolean;
  readonly assigned?: boolean;
  readonly bankDeposit?: boolean;
  readonly amount?: string;
  readonly search?: string;
  /** Capacité non supportée (D-T09-5) : demandée uniquement pour déclencher le refus avant réseau. */
  readonly nature?: string;
  /** Capacité non supportée (D-T09-5) : demandée uniquement pour déclencher le refus avant réseau. */
  readonly tri?: string;
}

export interface PageLignesEcriture {
  readonly resultats: LigneEcritureListe[];
  readonly total_source: number | null;
  readonly renvoyes: number;
  readonly avertissements: string[];
}

/**
 * `/lines-entries` (02 §2, D-T09-1) : wrapper `linesEntries` distinct de `data`, jamais lu comme
 * tel (D-T09-7). `ecriture_id` toujours `null` (aucun UUID documenté à ce niveau) ; `journal`,
 * `date`, `mode` proviennent de `entry{journal,date,entryMode}`. `id` dérivé du contenu source
 * (D-T09-2). Jamais de paramètres `journals` (CSV), `nature` ou de tri (D-T09-4) ; ces deux
 * derniers, s'ils sont demandés, sont refusés avant réseau (D-T09-5).
 */
export async function listerLignesEcriture(
  deps: DependancesClientHttp,
  budget: Budget,
  contexte: ContexteHttp,
  requete: RequeteListeLignesEcriture,
): Promise<PageLignesEcriture> {
  verifierCapaciteSupportee("filtre_nature_ligne", requete.nature !== undefined);
  verifierCapaciteSupportee("tri_explicite", requete.tri !== undefined);
  validerSkipTake(requete.skip, requete.take);
  const parametres: Record<string, string | number | boolean> = { skip: requete.skip, take: requete.take };
  if (requete.startDate !== undefined) parametres.startDate = requete.startDate;
  if (requete.endDate !== undefined) parametres.endDate = requete.endDate;
  if (requete.generalAccount !== undefined) parametres.generalAccount = requete.generalAccount;
  if (requete.auxiliaryAccount !== undefined) parametres.auxiliaryAccount = requete.auxiliaryAccount;
  if (requete.valid !== undefined) parametres.valid = requete.valid;
  if (requete.lettered !== undefined) parametres.lettered = requete.lettered;
  if (requete.assigned !== undefined) parametres.assigned = requete.assigned;
  if (requete.bankDeposit !== undefined) parametres.bankDeposit = requete.bankDeposit;
  if (requete.amount !== undefined) parametres.amount = requete.amount;
  if (requete.search !== undefined) parametres.search = requete.search;

  const corps = await executerRequetePourRoute(deps, budget, contexte, "cpt-lines-entries", { parametres });
  const elements = lireEnveloppeLinesEntries("cpt-lines-entries", corps);
  const avertissements: string[] = [];
  const rangDe = creerCompteurOccurrences();
  const resultats = elements.map((brut): LigneEcritureListe => {
    const resultat = LinesEntryEbpSchema.safeParse(brut);
    if (!resultat.success) {
      throw erreurEnveloppeInattendueCompta("cpt-lines-entries");
    }
    const source = resultat.data;
    const { mode, avertissement } = mapperMode(source.entry.entryMode);
    if (avertissement !== null) avertissements.push(avertissement);
    const debit = montantDepuisSource(source.debit, "lines-entries.debit", avertissements);
    const credit = montantDepuisSource(source.credit, "lines-entries.credit", avertissements);
    return {
      id: idLigneLocale(brut, rangDe(brut)),
      ecriture_id: null,
      journal: source.entry.journal,
      date: source.entry.date,
      mode,
      compte_general: source.generalAccount,
      compte_tiers: source.auxiliaryAccount,
      libelle: source.label,
      debit,
      credit,
      piece: source.piece,
      document: source.document ?? null,
      echeance: source.deadline,
      lettrage: source.lettering,
    };
  });
  if (resultats.length > 0) {
    avertissements.unshift(AVERT_ECRITURE_NON_IDENTIFIEE_LINES_ENTRIES);
  }
  // `/lines-entries` ne documente aucun total (02 §2) : `total_source` reste `null`, jamais inventé.
  return { resultats, total_source: null, renvoyes: resultats.length, avertissements };
}

export interface FicheEcriture {
  readonly resultat: Ecriture;
  readonly avertissements: string[];
}

/**
 * `/entries/{uuid}` (02 §2, D-T09-1) : écriture complète avec `lines[]`. Ici, et ici seulement,
 * `ecriture_id` = l'UUID lu (segment de route), jamais sur les routes de liste. `id` de ligne
 * dérivé du contenu source (D-T09-2).
 */
export async function lireEcriture(
  deps: DependancesClientHttp,
  budget: Budget,
  contexte: ContexteHttp,
  uuid: string,
): Promise<FicheEcriture> {
  const corps = await executerRequetePourRoute(deps, budget, contexte, "cpt-entry-detail", { segments: { uuid } });
  const fiche = lireFicheCompta("cpt-entry-detail", corps);
  const resultat = EntryDetailEbpSchema.safeParse(fiche);
  if (!resultat.success) {
    throw erreurEnveloppeInattendueCompta("cpt-entry-detail");
  }
  const source = resultat.data;
  const avertissements: string[] = [];
  const { mode, avertissement } = mapperMode(source.entryMode);
  if (avertissement !== null) avertissements.push(avertissement);
  const rangDe = creerCompteurOccurrences();
  const lignes = source.lines.map((ligneBrute): LigneEcriture => {
    const debit = montantDepuisSource(ligneBrute.debit, "entries.lines.debit", avertissements);
    const credit = montantDepuisSource(ligneBrute.credit, "entries.lines.credit", avertissements);
    return {
      id: idLigneLocale(ligneBrute, rangDe(ligneBrute)),
      ecriture_id: uuid,
      compte_general: ligneBrute.generalAccount,
      compte_tiers: ligneBrute.auxiliaryAccount,
      libelle: ligneBrute.label,
      debit,
      credit,
      piece: ligneBrute.piece,
      echeance: ligneBrute.deadline,
      lettrage: ligneBrute.lettering,
    };
  });
  return {
    resultat: { id: uuid, journal: source.journal, date: source.date, mode: mode ?? "inconnu", lignes },
    avertissements,
  };
}

export interface RechercheLignesParUuid {
  readonly resultats: LigneEcritureListe[];
  readonly avertissements: string[];
}

/**
 * `/search-entries/entries?uuids=` (02 §2, D-T09-1) : ⚠️ tableau nu, comptes courts et
 * `thirdAccount` conservés opaques. Aucun journal/date/mode documenté à ce niveau ⇒ `null` ;
 * `ecriture_id` toujours `null` (même motif que `/lines-entries`).
 */
export async function rechercherLignesParUuid(
  deps: DependancesClientHttp,
  budget: Budget,
  contexte: ContexteHttp,
  uuids: readonly string[],
): Promise<RechercheLignesParUuid> {
  const corps = await executerRequetePourRoute(deps, budget, contexte, "cpt-search-entries", {
    parametres: { uuids: uuids.join(",") },
  });
  const elements = lireEnveloppeTableauNuCompta("cpt-search-entries", corps);
  const avertissements: string[] = [];
  const rangDe = creerCompteurOccurrences();
  const resultats = elements.map((brut): LigneEcritureListe => {
    const resultat = SearchEntriesLineEbpSchema.safeParse(brut);
    if (!resultat.success) {
      throw erreurEnveloppeInattendueCompta("cpt-search-entries");
    }
    const source = resultat.data;
    const debit = montantDepuisSource(source.debit, "search-entries.debit", avertissements);
    const credit = montantDepuisSource(source.credit, "search-entries.credit", avertissements);
    return {
      id: idLigneLocale(brut, rangDe(brut)),
      ecriture_id: null,
      journal: null,
      date: null,
      mode: null,
      compte_general: source.generalAccount,
      compte_tiers: source.thirdAccount,
      libelle: source.label,
      debit,
      credit,
      piece: source.piece,
      document: null,
      echeance: source.deadline,
      lettrage: source.lettering,
    };
  });
  if (resultats.length > 0) {
    avertissements.unshift(AVERT_ECRITURE_NON_IDENTIFIEE_SEARCH_ENTRIES);
  }
  return { resultats, avertissements };
}
