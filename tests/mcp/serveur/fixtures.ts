import {
  CacheSource,
  identiteStore,
} from "../../../dist/index.js";
import type {
  AbonnementFamille,
  ClaimsIdToken,
  ConfigResolue,
  DepsProcessusPartage,
  Dossier,
  DossiersParEnvironnement,
  Famille,
  Identifiant,
  JournalMcp,
  Secret,
  TokenStore,
} from "../../../dist/index.js";
import {
  creerHookTokenFactice,
  creerQuotaFactice,
  creerTransportFactice,
  type ReponseFactice,
} from "../../http/fixtures.js";
import { creerHorlogeControlee, type HorlogeControlee } from "../../auth/fixtures.js";

const DEPART = new Date("2026-01-01T00:00:00.000Z");

export const DOSSIER_CPT: Dossier = { alias: "cpt-demo" as Identifiant, famille: "hubbix-compta", id: "tenant-cpt-1", nom: null };
export const DOSSIER_GC: Dossier = { alias: "gc-demo" as Identifiant, famille: "hubbix-gescom", id: "domain-gc-1", nom: null };

const DOSSIERS: DossiersParEnvironnement = {
  prod: [DOSSIER_CPT, DOSSIER_GC],
  preprod: [],
};

export function creerConfigServeurTest(overrides: Partial<ConfigResolue> = {}): ConfigResolue {
  const dossiers = overrides.dossiers ?? DOSSIERS;
  const famillesActives = overrides.famillesActives ?? (["hubbix-compta", "hubbix-gescom"] as const);
  const store = identiteStore("/tmp/ebp-mcp-test-serveur", "profil-test", "prod", "client-test");
  const groupesQuota = overrides.groupesQuota ?? new Map([
    ["groupe-test" as Identifiant, { maxPerDay: 10_000, reserve: 100, minIntervalMs: 0, resetTimezone: "UTC" }],
  ]);
  const config: ConfigResolue = {
    profil: "profil-test" as Identifiant,
    environnement: "prod",
    clientId: "client-test",
    clientSecret: null,
    redirectUri: "http://127.0.0.1:0/callback",
    pkce: "required",
    famillesActives,
    groupesQuota,
    dossiers,
    aliasDefaut: null,
    redactPii: false,
    identiteStore: store,
    abonnementPourFamille(_famille: Famille): AbonnementFamille {
      return { cle: null as Secret | null, groupeQuota: "groupe-test" as Identifiant };
    },
    ...overrides,
  };
  return config;
}

export function creerTokenStoreFactice(generation: number | null = null): TokenStore {
  return {
    async read() {
      return generation === null
        ? null
        : {
            accessToken: "acc",
            refreshToken: "ref",
            expiresAt: new Date(DEPART.getTime() + 3600_000).toISOString(),
            refreshedAt: DEPART.toISOString(),
            refreshExpiresAtEstimate: null,
            generation,
            state: "ready" as const,
          };
    },
    async write() {
      // Non utilisé par ces tests.
    },
    async clear() {
      // Non utilisé par ces tests.
    },
  };
}

export interface JournalMcpFactice extends JournalMcp {
  readonly entrees: unknown[];
}

export function creerJournalMcpFactice(): JournalMcpFactice {
  const entrees: unknown[] = [];
  return {
    entrees,
    erreur(entree) {
      entrees.push(entree);
    },
  };
}

/** Dépendances partagées de processus (D-T12-10) : un seul transport/quota/hookToken/cache pour toute la fabrique. */
export function creerDepsPartageTest(
  reponses: ReponseFactice[] = [],
  overrides: {
    readonly config?: ConfigResolue;
    readonly generationTokenStore?: number | null;
    readonly claims?: ClaimsIdToken | null;
  } = {},
) {
  const config = overrides.config ?? creerConfigServeurTest();
  const clock: HorlogeControlee = creerHorlogeControlee(DEPART);
  const transport = creerTransportFactice(reponses);
  const quota = creerQuotaFactice(clock);
  const hookToken = creerHookTokenFactice({ accessToken: "acc-1", generation: 1 });
  const journal = creerJournalMcpFactice();
  const tokenStore = creerTokenStoreFactice(overrides.generationTokenStore ?? null);
  const depsPartage: DepsProcessusPartage = {
    config,
    http: { transport, clock, quota, hookToken },
    cache: new CacheSource(clock),
    clock,
    tokenStore,
    journal,
    claims: overrides.claims ?? null,
  };
  return { depsPartage, config, clock, transport, quota, hookToken, journal, tokenStore };
}
