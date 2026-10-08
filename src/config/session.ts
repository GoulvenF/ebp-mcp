import type { Environnement } from "../domain/capabilities.js";
import { erreurDossierInconnu } from "./errors.js";
import type { Identifiant } from "./identifiers.js";
import type { ContexteResolutionDossier, Dossier } from "./dossiers.js";
import { resoudreDossier } from "./dossiers.js";
import type { IdentiteStore } from "./store-identity.js";

/** `ebp_choisir_dossier` ne modifie jamais la config persistée (07 §2) : état mémoire seul. */
export interface Session {
  alias(): Identifiant | null;
  choisir(alias: string): void;
  reinitialiser(): void;
}

export function creerSession(config: { dossiers: ContexteResolutionDossier["dossiers"]; environnement: Environnement }): Session {
  let courant: Identifiant | null = null;
  return {
    alias: () => courant,
    choisir: (alias: string) => {
      const liste = config.dossiers[config.environnement];
      if (!liste.some((d) => d.alias === alias)) {
        throw erreurDossierInconnu(alias, config.environnement);
      }
      courant = alias as Identifiant;
    },
    reinitialiser: () => {
      courant = null;
    },
  };
}

/** Instantané gelé (07 §2) : une requête en vol conserve le dossier capturé avant tout changement concurrent. */
export interface ContexteDossier {
  readonly dossier: Dossier;
  readonly environnement: Environnement;
  readonly identiteStore: IdentiteStore;
}

export function capturerContexteDossier(
  config: ContexteResolutionDossier & { identiteStore: IdentiteStore },
  session: Session,
  args: { dossier?: string },
): ContexteDossier {
  const dossier = resoudreDossier(config, args, session.alias());
  return Object.freeze({
    dossier,
    environnement: config.environnement,
    identiteStore: config.identiteStore,
  });
}
