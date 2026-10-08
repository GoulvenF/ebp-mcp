import type { Environnement, Famille } from "../domain/capabilities.js";
import { erreurDossierInconnu, erreurDossierRequis, erreurFamilleInactive } from "./errors.js";
import type { Identifiant } from "./identifiers.js";
import { validerIdDistant } from "./identifiers.js";
import type { ProfilBrut } from "./schema.js";

/** Modèle normalisé unique manipulé par les services (07 §2) : les adapters ne voient jamais tenantId/domainId. */
export interface Dossier {
  readonly alias: Identifiant;
  readonly famille: Famille;
  readonly id: string;
  readonly nom: string | null;
}

export interface DossiersParEnvironnement {
  readonly prod: readonly Dossier[];
  readonly preprod: readonly Dossier[];
}

function normaliserListe(liste: ProfilBrut["dossiers"]["prod"]): Dossier[] {
  return liste.map((dossier) => {
    const idBrut = dossier.famille === "hubbix-compta" ? dossier.tenantId : dossier.domainId;
    const id = validerIdDistant(idBrut);
    return {
      alias: dossier.alias as Identifiant,
      famille: dossier.famille,
      id,
      nom: dossier.nom ?? null,
    };
  });
}

/** Projette `tenantId`/`domainId` sur `id` selon la famille (lignes 37/131 de 02). */
export function normaliserDossiers(profil: ProfilBrut): DossiersParEnvironnement {
  return {
    prod: normaliserListe(profil.dossiers.prod),
    preprod: normaliserListe(profil.dossiers.preprod),
  };
}

/** Vue minimale requise pour résoudre un dossier, satisfaite structurellement par `ConfigResolue`. */
export interface ContexteResolutionDossier {
  readonly dossiers: DossiersParEnvironnement;
  readonly environnement: Environnement;
  readonly famillesActives: readonly Famille[];
  readonly aliasDefaut: Identifiant | null;
}

/**
 * Résolution d'un dossier (07 §2) : argument > dossier actif de la session > défaut de
 * l'environnement actif, sinon `DOSSIER_REQUIRED` même s'il n'existe qu'un seul dossier. Alias
 * inconnu ⇒ `DOSSIER_UNKNOWN`, aucune sélection de secours. Ne regarde que l'environnement actif.
 */
export function resoudreDossier(
  config: ContexteResolutionDossier,
  args: { dossier?: string },
  aliasSession: Identifiant | null,
): Dossier {
  const liste = config.dossiers[config.environnement];
  const aliasDemande = args.dossier ?? aliasSession ?? config.aliasDefaut;
  if (aliasDemande === undefined || aliasDemande === null) {
    throw erreurDossierRequis(config.environnement);
  }
  const trouve = liste.find((d) => d.alias === aliasDemande);
  if (trouve === undefined) {
    throw erreurDossierInconnu(aliasDemande, config.environnement);
  }
  exigerFamilleActive(config, trouve.famille);
  return trouve;
}

/** Point d'application de « aucun appel vers une famille non activée » (T07–T10). */
export function exigerFamilleActive(config: { famillesActives: readonly Famille[] }, famille: Famille): void {
  if (!config.famillesActives.includes(famille)) {
    throw erreurFamilleInactive(famille);
  }
}
