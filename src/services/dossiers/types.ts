import type { Environnement, Famille } from "../../domain/capabilities.js";
import type { DossiersParEnvironnement } from "../../config/dossiers.js";
import type { DependancesEcritureConfig } from "../../config/ecriture.js";
import { erreurConfigInvalide } from "../../config/errors.js";
import type { Identifiant } from "../../config/identifiers.js";
import type { AbonnementFamille } from "../../config/resolution.js";
import type { FichierConfig, ProfilBrut } from "../../config/schema.js";
import type { DependancesClientHttp } from "../../http/client.js";
import type { LockManager } from "../../ports/lock-manager.js";
import type { OperationsFichier } from "../../storage/operations-fichier.js";

/** Dépendances de `ajouterDossier`/`retirerDossier` (issue GOU-372) : client HTTP contrôlé (T07), verrou et FS (T04). */
export interface DepsDossiers {
  readonly http: DependancesClientHttp;
  readonly verrous: LockManager;
  readonly operations: OperationsFichier;
}

/**
 * Contexte minimal nécessaire à `ajouterDossier`/`retirerDossier`, satisfait structurellement par
 * `ConfigResolue` (`src/config/resolution.ts`) augmenté du chemin de `config.json` et des bornes
 * d'exécution de l'appel (07 §4 : budget 30, deadline 60 s) — un appelant (T13-3) peut donc passer
 * `{ ...config, chemin, deadline, signal }` sans redupliquer ces champs.
 */
export interface ContexteDossiers {
  /** Chemin de `config.json` dans la racine de configuration active (07 §2). */
  readonly chemin: string;
  readonly profil: Identifiant;
  readonly environnement: Environnement;
  readonly famillesActives: readonly Famille[];
  readonly dossiers: DossiersParEnvironnement;
  abonnementPourFamille(famille: Famille): AbonnementFamille;
  readonly deadline: Date;
  readonly signal?: AbortSignal;
}

/** Assemble les dépendances de `modifierConfig` à partir de `DepsDossiers`/`ContexteDossiers`. */
export function construireDepsEcriture(deps: DepsDossiers, ctx: ContexteDossiers): DependancesEcritureConfig {
  return {
    verrous: deps.verrous,
    operations: deps.operations,
    chemin: ctx.chemin,
    deadline: ctx.deadline,
    ...(ctx.signal !== undefined ? { signal: ctx.signal } : {}),
  };
}

/** Profil ciblé dans le fichier relu sous verrou ; `modifierConfig` garantit déjà sa présence. */
export function profilCible(fichier: FichierConfig, profil: Identifiant): ProfilBrut {
  const profilActuel = fichier.profiles[profil];
  if (profilActuel === undefined) {
    throw erreurConfigInvalide(`Profil "${profil}" absent de config.json.`, { profil });
  }
  return profilActuel;
}
