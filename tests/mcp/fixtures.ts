import {
  CacheSource,
  MagasinCurseurs,
  creerSession,
  identiteStore,
} from "../../dist/index.js";
import type {
  AbonnementFamille,
  ConfigResolue,
  Dossier,
  DossiersParEnvironnement,
  Famille,
  Identifiant,
  JournalMcp,
  Secret,
  SessionMcp,
  TokenStore,
} from "../../dist/index.js";
import {
  creerHookTokenFactice,
  creerQuotaFactice,
  creerTransportFactice,
  type ReponseFactice,
} from "../http/fixtures.js";
import { creerHorlogeControlee, type HorlogeControlee } from "../auth/fixtures.js";

const DEPART = new Date("2026-01-01T00:00:00.000Z");

const DOSSIER_CPT: Dossier = { alias: "cpt-demo" as Identifiant, famille: "hubbix-compta", id: "tenant-cpt-1", nom: null };
const DOSSIER_GC: Dossier = { alias: "gc-demo" as Identifiant, famille: "hubbix-gescom", id: "domain-gc-1", nom: null };

const DOSSIERS: DossiersParEnvironnement = {
  prod: [DOSSIER_CPT, DOSSIER_GC],
  preprod: [],
};

export { DOSSIER_CPT, DOSSIER_GC };

export function creerConfigTest(overrides: Partial<ConfigResolue> = {}): ConfigResolue {
  const dossiers = overrides.dossiers ?? DOSSIERS;
  const famillesActives = overrides.famillesActives ?? (["hubbix-compta", "hubbix-gescom"] as const);
  const store = identiteStore("/tmp/ebp-mcp-test", "profil-test", "prod", "client-test");
  const config: ConfigResolue = {
    profil: "profil-test" as Identifiant,
    environnement: "prod",
    clientId: "client-test",
    clientSecret: null,
    redirectUri: "http://127.0.0.1:0/callback",
    pkce: "required",
    famillesActives,
    groupesQuota: new Map(),
    dossiers,
    aliasDefaut: null,
    redactPii: false,
    identiteStore: store,
    abonnementPourFamille(famille: Famille): AbonnementFamille {
      return { cle: null as Secret | null, groupeQuota: "groupe-test" as Identifiant };
    },
    ...overrides,
  };
  return config;
}

export function creerSessionMcpTest(config: ConfigResolue, clock: HorlogeControlee = creerHorlogeControlee(DEPART)): SessionMcp {
  return {
    session: creerSession({ dossiers: config.dossiers, environnement: config.environnement }),
    curseurs: new MagasinCurseurs(clock),
  };
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
      // Non utilisé par ce lot : lecture seule de la génération.
    },
    async clear() {
      // Non utilisé par ce lot.
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

export function creerDepsProcessusTest(
  reponses: ReponseFactice[] = [],
  overrides: {
    readonly config?: ConfigResolue;
    readonly generationTokenStore?: number | null;
  } = {},
) {
  const config = overrides.config ?? creerConfigTest();
  const clock = creerHorlogeControlee(DEPART);
  const transport = creerTransportFactice(reponses);
  const quota = creerQuotaFactice(clock);
  const hookToken = creerHookTokenFactice({ accessToken: "acc-1", generation: 1 });
  const journal = creerJournalMcpFactice();
  const tokenStore = creerTokenStoreFactice(overrides.generationTokenStore ?? null);
  return {
    config,
    http: { transport, clock, quota, hookToken },
    scan: { curseurs: new MagasinCurseurs(clock), cache: new CacheSource(clock), clock },
    clock,
    tokenStore,
    journal,
    transport,
    quota,
    hookToken,
  };
}
