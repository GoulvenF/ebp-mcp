import type { z } from "zod";
import type { Budget } from "../../http/budget.js";
import type { ContexteHttp, DependancesClientHttp } from "../../http/client.js";
import { executerRequetePourRoute } from "../../http/client.js";
import { CompteGeneralSchema } from "../../domain/schemas/compta.js";
import { lireEnveloppeData, lireFicheCompta } from "./enveloppe.js";
import { erreurEnveloppeInattendueCompta } from "./errors.js";
import { GeneralAccountEbpSchema } from "./schemas-ebp.js";

export type CompteGeneral = z.infer<typeof CompteGeneralSchema>;

function mapper(source: z.infer<typeof GeneralAccountEbpSchema>): CompteGeneral {
  return {
    id: source.uuid,
    numero: source.number,
    libelle: source.label,
    actif: source.active,
    collectif: source.collective,
    racine: source.racine,
  };
}

export interface RequeteListeComptesGeneraux {
  readonly search?: string;
  readonly isActive?: boolean;
  readonly isRacine?: boolean;
  readonly isCollective?: boolean;
  readonly numberFrom?: string;
  readonly classNumber?: string;
  readonly vatRate?: string;
  readonly territoriality?: string;
}

export interface ListeComptesGeneraux {
  readonly resultats: CompteGeneral[];
  readonly total_source: number | null;
  readonly renvoyes: number;
  readonly avertissements: string[];
}

/**
 * `/general-account` (02 §2, singulier ⚠️) : `{data:[{uuid,number,label,active,collective,
 * racine}]}`, sans `totalRecords` documenté — pas de `skip`/`take` dans le registre T07 pour
 * cette route (02 ne documente aucune pagination ici) : référentiel lu en un seul appel.
 */
export async function listerComptesGeneraux(
  deps: DependancesClientHttp,
  budget: Budget,
  contexte: ContexteHttp,
  requete: RequeteListeComptesGeneraux = {},
): Promise<ListeComptesGeneraux> {
  const parametres: Record<string, string | number | boolean> = {};
  if (requete.search !== undefined) parametres.search = requete.search;
  if (requete.isActive !== undefined) parametres.isActive = requete.isActive;
  if (requete.isRacine !== undefined) parametres.isRacine = requete.isRacine;
  if (requete.isCollective !== undefined) parametres.isCollective = requete.isCollective;
  if (requete.numberFrom !== undefined) parametres.numberFrom = requete.numberFrom;
  if (requete.classNumber !== undefined) parametres.classNumber = requete.classNumber;
  if (requete.vatRate !== undefined) parametres.vatRate = requete.vatRate;
  if (requete.territoriality !== undefined) parametres.territoriality = requete.territoriality;
  const corps = await executerRequetePourRoute(deps, budget, contexte, "cpt-general-account", { parametres });
  const enveloppe = lireEnveloppeData("cpt-general-account", corps);
  const resultats = enveloppe.elements.map((brut): CompteGeneral => {
    const resultat = GeneralAccountEbpSchema.safeParse(brut);
    if (!resultat.success) {
      throw erreurEnveloppeInattendueCompta("cpt-general-account");
    }
    return mapper(resultat.data);
  });
  return { resultats, total_source: enveloppe.totalSource, renvoyes: resultats.length, avertissements: [] };
}

export interface FicheCompteGeneral {
  readonly resultat: CompteGeneral;
  readonly avertissements: string[];
}

/**
 * `/general-account/{numero}` (02 §2) : détail porte aussi `taxType`, `operationType`, non
 * mappés ici (non repris par `CompteGeneralSchema`, hors périmètre T09 défini).
 */
export async function lireCompteGeneral(
  deps: DependancesClientHttp,
  budget: Budget,
  contexte: ContexteHttp,
  numero: string,
): Promise<FicheCompteGeneral> {
  const corps = await executerRequetePourRoute(deps, budget, contexte, "cpt-general-account-detail", {
    segments: { numero },
  });
  const fiche = lireFicheCompta("cpt-general-account-detail", corps);
  const resultat = GeneralAccountEbpSchema.safeParse(fiche);
  if (!resultat.success) {
    throw erreurEnveloppeInattendueCompta("cpt-general-account-detail");
  }
  return { resultat: mapper(resultat.data), avertissements: [] };
}
