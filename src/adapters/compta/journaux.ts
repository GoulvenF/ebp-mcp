import type { z } from "zod";
import type { Budget } from "../../http/budget.js";
import type { ContexteHttp, DependancesClientHttp } from "../../http/client.js";
import { executerRequetePourRoute } from "../../http/client.js";
import { interpreterEnum } from "../../domain/enum.js";
import { JournalSchema } from "../../domain/schemas/compta.js";
import { lireEnveloppeData, lireFicheCompta } from "./enveloppe.js";
import { erreurEnveloppeInattendueCompta } from "./errors.js";
import { JournalEbpSchema } from "./schemas-ebp.js";

export type JournalCpt = z.infer<typeof JournalSchema>;

/** `journalType.name` (02 §2) : Achats, Ventes, Trésorerie, Opérations diverses, À Nouveaux. */
const TYPES_JOURNAL_SOURCE = ["Achats", "Ventes", "Trésorerie", "Opérations diverses", "À Nouveaux"] as const;
const LABELS_TYPE_JOURNAL: Readonly<Record<(typeof TYPES_JOURNAL_SOURCE)[number], NonNullable<JournalCpt["type"]>>> = {
  Achats: "achats",
  Ventes: "ventes",
  Trésorerie: "tresorerie",
  "Opérations diverses": "operations_diverses",
  "À Nouveaux": "a_nouveaux",
};

function mapperTypeJournal(nomSource: unknown): {
  type: JournalCpt["type"];
  type_source: string | null;
  avertissement: string | null;
} {
  const typeSource = typeof nomSource === "string" ? nomSource : null;
  if (nomSource === null || nomSource === undefined) {
    return { type: null, type_source: null, avertissement: null };
  }
  const resultat = interpreterEnum(nomSource, TYPES_JOURNAL_SOURCE);
  if (resultat.valeur === "inconnu") {
    return { type: "inconnu", type_source: typeSource, avertissement: resultat.avertissement };
  }
  return { type: LABELS_TYPE_JOURNAL[resultat.valeur], type_source: typeSource, avertissement: null };
}

function mapper(source: z.infer<typeof JournalEbpSchema>, avertissements: string[]): JournalCpt {
  const { type, type_source, avertissement } = mapperTypeJournal(source.journalType?.name ?? null);
  if (avertissement !== null) avertissements.push(avertissement);
  return {
    id: source.uuid,
    code: source.code,
    nom: source.name,
    type,
    type_source,
    compte_contrepartie: source.counterpartAccount ?? null,
  };
}

export interface ListeJournaux {
  readonly resultats: JournalCpt[];
  readonly total_source: number | null;
  readonly renvoyes: number;
  readonly avertissements: string[];
}

/**
 * `/journals` (02 §2) : `filter`/`order` exclus (D-T09-4, forme non prouvée) ; pas de pagination
 * documentée — référentiel complet en un seul appel.
 */
export async function listerJournaux(
  deps: DependancesClientHttp,
  budget: Budget,
  contexte: ContexteHttp,
): Promise<ListeJournaux> {
  const corps = await executerRequetePourRoute(deps, budget, contexte, "cpt-journals");
  const enveloppe = lireEnveloppeData("cpt-journals", corps);
  const avertissements: string[] = [];
  const resultats = enveloppe.elements.map((brut): JournalCpt => {
    const resultat = JournalEbpSchema.safeParse(brut);
    if (!resultat.success) {
      throw erreurEnveloppeInattendueCompta("cpt-journals");
    }
    return mapper(resultat.data, avertissements);
  });
  return { resultats, total_source: enveloppe.totalSource, renvoyes: resultats.length, avertissements };
}

export interface FicheJournal {
  readonly resultat: JournalCpt;
  readonly avertissements: string[];
}

/** `/journals/{code}` (02 §2), ex. `AC`. */
export async function lireJournal(
  deps: DependancesClientHttp,
  budget: Budget,
  contexte: ContexteHttp,
  code: string,
): Promise<FicheJournal> {
  const corps = await executerRequetePourRoute(deps, budget, contexte, "cpt-journal-detail", { segments: { code } });
  const fiche = lireFicheCompta("cpt-journal-detail", corps);
  const resultat = JournalEbpSchema.safeParse(fiche);
  if (!resultat.success) {
    throw erreurEnveloppeInattendueCompta("cpt-journal-detail");
  }
  const avertissements: string[] = [];
  const journal = mapper(resultat.data, avertissements);
  return { resultat: journal, avertissements };
}
