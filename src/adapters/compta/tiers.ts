import type { z } from "zod";
import type { Budget } from "../../http/budget.js";
import type { ContexteHttp, DependancesClientHttp } from "../../http/client.js";
import { executerRequetePourRoute } from "../../http/client.js";
import { TiersSchema, TypeCompteAuxiliaireSchema } from "../../domain/schemas/compta.js";
import { verifierCapaciteSupportee } from "./capacites.js";
import { lireEnveloppeData, lireFicheCompta } from "./enveloppe.js";
import { erreurEnveloppeInattendueCompta, erreurSkipInvalideCompta, erreurTakeInvalideCompta } from "./errors.js";
import {
  AuxiliaryAccountDetailEbpSchema,
  AuxiliaryAccountEbpSchema,
  AuxiliaryAccountTypeEbpSchema,
} from "./schemas-ebp.js";

export type Tiers = z.infer<typeof TiersSchema>;
export type TypeCompteAuxiliaire = z.infer<typeof TypeCompteAuxiliaireSchema>;

const CODES_TYPE_CONNUS = ["C", "F", "S", "O", "A"] as const;

function mapperTiersListe(
  source: z.infer<typeof AuxiliaryAccountEbpSchema>,
  avertissements: string[],
): Omit<Tiers, "email" | "telephone"> {
  if (source.name === null || source.name === undefined) {
    avertissements.push("Champ absent reçu de la source : name");
  }
  return {
    id: source.uuid,
    compte: source.number,
    nom: source.name ?? "",
    types: source.types,
    numero_tva: source.vatNumber,
    siret: source.siret,
    actif: source.isActive,
  };
}

function validerSkipTake(skip: number, take: number): void {
  if (!Number.isInteger(take) || take < 1 || take > 100) {
    throw erreurTakeInvalideCompta(take);
  }
  if (!Number.isInteger(skip) || skip < 0) {
    throw erreurSkipInvalideCompta(skip);
  }
}

export interface RequeteListeTiers {
  readonly skip: number;
  readonly take: number;
  readonly search?: string;
  readonly isActive?: boolean;
  readonly numberFrom?: string;
  /** Capacité non supportée (D-T09-5) : demandée uniquement pour déclencher le refus avant réseau. */
  readonly categorie?: string;
}

export interface PageTiers {
  readonly resultats: Tiers[];
  readonly total_source: number | null;
  readonly renvoyes: number;
  readonly avertissements: string[];
}

/**
 * Lit une page de `/auxiliary-accounts` (02 §2). Seuls `search`, `isActive`, `numberFrom`,
 * `skip`, `take` sont envoyés (D-T09-4) : jamais `category` (capacité non supportée, D-T09-5),
 * jamais `sortField`/`sortDirection` même si le registre T07 les autorise.
 */
export async function listerTiers(
  deps: DependancesClientHttp,
  budget: Budget,
  contexte: ContexteHttp,
  requete: RequeteListeTiers,
): Promise<PageTiers> {
  verifierCapaciteSupportee("filtre_categorie_tiers", requete.categorie !== undefined);
  validerSkipTake(requete.skip, requete.take);
  const parametres: Record<string, string | number | boolean> = { skip: requete.skip, take: requete.take };
  if (requete.search !== undefined) parametres.search = requete.search;
  if (requete.isActive !== undefined) parametres.isActive = requete.isActive;
  if (requete.numberFrom !== undefined) parametres.numberFrom = requete.numberFrom;
  const corps = await executerRequetePourRoute(deps, budget, contexte, "cpt-auxiliary-accounts", { parametres });
  const enveloppe = lireEnveloppeData("cpt-auxiliary-accounts", corps);
  const avertissements: string[] = [];
  const resultats = enveloppe.elements.map((brut): Tiers => {
    const resultat = AuxiliaryAccountEbpSchema.safeParse(brut);
    if (!resultat.success) {
      throw erreurEnveloppeInattendueCompta("cpt-auxiliary-accounts");
    }
    return { ...mapperTiersListe(resultat.data, avertissements), email: null, telephone: null };
  });
  return { resultats, total_source: enveloppe.totalSource, renvoyes: resultats.length, avertissements };
}

export interface FicheTiers {
  readonly resultat: Tiers;
  readonly avertissements: string[];
}

/** `/auxiliary-accounts/{number}` (02 §2) : fiche + `contact.email`, non garanti par la liste. */
export async function lireTiers(
  deps: DependancesClientHttp,
  budget: Budget,
  contexte: ContexteHttp,
  numero: string,
): Promise<FicheTiers> {
  const corps = await executerRequetePourRoute(deps, budget, contexte, "cpt-auxiliary-account-detail", {
    segments: { numero },
  });
  const fiche = lireFicheCompta("cpt-auxiliary-account-detail", corps);
  const resultat = AuxiliaryAccountDetailEbpSchema.safeParse(fiche);
  if (!resultat.success) {
    throw erreurEnveloppeInattendueCompta("cpt-auxiliary-account-detail");
  }
  const source = resultat.data;
  const avertissements: string[] = [];
  return {
    resultat: {
      ...mapperTiersListe(source, avertissements),
      email: source.contact?.email ?? null,
      telephone: null,
    },
    avertissements,
  };
}

export interface ListeTypesCompteAuxiliaire {
  readonly resultats: TypeCompteAuxiliaire[];
  readonly avertissements: string[];
}

/**
 * `/auxiliary-account-types` (02 §2, prose) : forme de wrapper non prouvée par un échantillon
 * JSON — supposition `{data:[...]}` documentée dans `schemas-ebp.ts`. Code source inconnu ⇒
 * `"inconnu"` + avertissement citant la valeur d'origine, jamais déduit d'un préfixe de compte.
 */
export async function listerTypesCompteAuxiliaire(
  deps: DependancesClientHttp,
  budget: Budget,
  contexte: ContexteHttp,
): Promise<ListeTypesCompteAuxiliaire> {
  const corps = await executerRequetePourRoute(deps, budget, contexte, "cpt-auxiliary-account-types");
  const enveloppe = lireEnveloppeData("cpt-auxiliary-account-types", corps);
  const avertissements: string[] = [];
  const resultats = enveloppe.elements.map((brut): TypeCompteAuxiliaire => {
    const resultat = AuxiliaryAccountTypeEbpSchema.safeParse(brut);
    if (!resultat.success) {
      throw erreurEnveloppeInattendueCompta("cpt-auxiliary-account-types");
    }
    const source = resultat.data;
    const connu =
      typeof source.code === "string" &&
      (CODES_TYPE_CONNUS as readonly string[]).includes(source.code);
    if (!connu) {
      avertissements.push(`Valeur enum inconnue reçue de la source : ${JSON.stringify(source.code)}`);
    }
    return {
      code: connu ? (source.code as TypeCompteAuxiliaire["code"]) : "inconnu",
      code_source: source.code,
      compte_collectif: source.collectiveAccount,
    };
  });
  return { resultats, avertissements };
}
