import type { Environnement, Famille } from "../../domain/capabilities.js";
import type { ConfigResolue } from "../../config/resolution.js";
import type { Identifiant } from "../../config/identifiers.js";
import { manifesteCapacites, OUTILS_METIER } from "../commun/capacites.js";
import type { CapaciteOutil } from "../commun/capacites.js";

/** Motif uniforme d'une famille non activée dans le profil (D-T12-11), distinct des motifs par outil de `manifesteCapacites`. */
const MOTIF_FAMILLE_NON_ACTIVE_PROFIL = "famille non activée dans le profil";

export interface DossierContexte {
  readonly alias: string;
  readonly famille: Famille;
  readonly id: string;
  readonly nom: string | null;
  readonly famille_active: boolean;
  readonly validation_live: "non_prouvee";
  readonly capacites: CapaciteOutil[];
}

export interface ListerDossiersContexteResultat {
  readonly environnement: Environnement;
  readonly dossier_actif: string | null;
  readonly dossier_defaut: string | null;
  readonly dossiers: DossierContexte[];
}

/**
 * Capacités d'un dossier (D-T12-11) : famille active ⇒ manifeste réel (`manifesteCapacites`,
 * mélange disponible/non_supportee par outil) ; famille inactive ⇒ les 14 outils refusés avec un
 * motif unique, distinct des motifs par outil déjà déclarés par le manifeste pour une famille
 * incompatible mais activée.
 */
function capacitesPourDossier(famille: Famille, familleActive: boolean): CapaciteOutil[] {
  if (!familleActive) {
    return OUTILS_METIER.map((outil) => ({
      outil,
      statut: "non_supportee" as const,
      motif: MOTIF_FAMILLE_NON_ACTIVE_PROFIL,
      optionsNonSupportees: [],
    }));
  }
  return manifesteCapacites(famille);
}

/**
 * `ebp_lister_dossiers` (D-T12-11, 07 §6) : données pures, 0 réseau. Seuls les dossiers de
 * l'environnement actif de `config` sont listés ; `dossier_actif` suit la même précédence que la
 * résolution d'un outil, sans argument explicite ici (session > défaut). `validation_live` est une
 * constante v0.1 (09) : aucune validation live n'est jamais enregistrée par ce lot.
 */
export function listerDossiersContexte(
  config: ConfigResolue,
  sessionAlias: Identifiant | null,
): ListerDossiersContexteResultat {
  const liste = config.dossiers[config.environnement];
  const dossiers = liste.map((dossier): DossierContexte => {
    const familleActive = config.famillesActives.includes(dossier.famille);
    return {
      alias: dossier.alias,
      famille: dossier.famille,
      id: dossier.id,
      nom: dossier.nom,
      famille_active: familleActive,
      validation_live: "non_prouvee",
      capacites: capacitesPourDossier(dossier.famille, familleActive),
    };
  });

  return {
    environnement: config.environnement,
    dossier_actif: sessionAlias ?? config.aliasDefaut ?? null,
    dossier_defaut: config.aliasDefaut ?? null,
    dossiers,
  };
}
