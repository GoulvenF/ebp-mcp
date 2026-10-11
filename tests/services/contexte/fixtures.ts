import type { ConfigResolue, EntreesResolution, Identifiant, QuotaStore, StatutQuota, TokenStore } from "../../../dist/index.js";
import { resoudreConfig } from "../../../dist/index.js";

export const TENANT_ID_CPT = "11111111-1111-4111-8111-111111111111";
export const TENANT_ID_CPT_2 = "11111111-1111-4111-8111-111111111112";
export const DOMAIN_ID_GC = "22222222-2222-4222-8222-222222222222";

/** Fichier `config.json` minimal, un profil `default`, un groupe de quota `grp` partagé par les 2 familles. */
export function fichierContexte(overrides?: {
  enabledFamilies?: string[];
  dossiersProd?: unknown[];
  defaultDossierProd?: string;
}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    profiles: {
      default: {
        env: "prod",
        clientId: "client-defaut",
        clientSecret: "secret-ne-doit-jamais-sortir",
        subscriptionKey: "cle-abonnement-secrete",
        redirectUri: "http://127.0.0.1:9000/callback",
        enabledFamilies: overrides?.enabledFamilies ?? ["hubbix-compta", "hubbix-gescom"],
        quotaGroup: "grp",
        dossiers: {
          prod: overrides?.dossiersProd ?? [
            { alias: "dossier-cpt", famille: "hubbix-compta", nom: "Dossier CPT", tenantId: TENANT_ID_CPT },
            { alias: "dossier-gc", famille: "hubbix-gescom", nom: null, domainId: DOMAIN_ID_GC },
          ],
          preprod: [],
        },
        defaultDossier: { prod: overrides?.defaultDossierProd ?? "dossier-cpt" },
      },
    },
    quotaGroups: {
      grp: { maxPerDay: 10000, reserve: 500, minIntervalMs: 1000, resetTimezone: "Europe/Paris" },
    },
  };
}

export function configDe(overrides?: Parameters<typeof fichierContexte>[0]): ConfigResolue {
  const entrees: EntreesResolution = {
    contenuFichier: JSON.stringify(fichierContexte(overrides)),
    variablesEnv: {},
    cli: {},
    racine: "/config-racine",
    journal: { avertir: () => {} },
  };
  return resoudreConfig(entrees);
}

export function aliasDe(valeur: string): Identifiant {
  return valeur as Identifiant;
}

export interface TokenStoreFactice extends TokenStore {
  readonly appelsLecture: number;
}

/** `TokenStore` en mémoire (0 E/S, 0 réseau), pour `statutContexte`. */
export function creerTokenStoreFactice(enregistrementInitial: Parameters<TokenStore["write"]>[1] | null = null): TokenStoreFactice {
  let enregistrement = enregistrementInitial;
  let appelsLecture = 0;
  return {
    get appelsLecture() {
      return appelsLecture;
    },
    async read() {
      appelsLecture += 1;
      return enregistrement;
    },
    async write(_identite, nouveau) {
      enregistrement = nouveau;
    },
    async clear() {
      enregistrement = null;
    },
  };
}

export interface QuotaStoreFactice extends QuotaStore {
  readonly groupesInterroges: string[];
}

/** `QuotaStore` en mémoire (0 réseau) : `getStatut` renvoie des valeurs fixes par groupe interrogé. */
export function creerQuotaStoreFactice(): QuotaStoreFactice {
  const groupesInterroges: string[] = [];
  return {
    groupesInterroges,
    async reserveDepart(): Promise<void> {
      throw new Error("reserveDepart appelé alors qu'il ne devait pas l'être (ebp_statut, 0 réseau).");
    },
    async getStatut(groupe: string): Promise<StatutQuota> {
      groupesInterroges.push(groupe);
      return { quotaJourRestant: 9000, quotaUtilisable: 8500, quotaEstime: true };
    },
    async enregistrerCooldown429(): Promise<void> {
      throw new Error("enregistrerCooldown429 appelé alors qu'il ne devait pas l'être (ebp_statut, 0 réseau).");
    },
    async incrementerAuth(): Promise<void> {
      throw new Error("incrementerAuth appelé alors qu'il ne devait pas l'être (ebp_statut, 0 réseau).");
    },
    async getCompteurAuth(): Promise<number> {
      return 0;
    },
  };
}
