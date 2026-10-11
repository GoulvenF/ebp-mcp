// Processus enfant de test (fiche T12, acceptation « stdio ») : importe `dist/`, construit une
// config temporaire synthétique en mode `mock`, puis connecte un `StdioServerTransport` réel.
// Jamais exécuté directement par un développeur ; seulement par `tests/integration/stdio.test.ts`.
import {
  CacheSource,
  creerFabriqueServeur,
  creerJournalMcpStderr,
  demarrerStdio,
  identiteStore,
} from "../../dist/index.js";

const clock = { now: () => new Date(), wait: async () => {} };

const DOSSIER_CPT = { alias: "cpt-demo", famille: "hubbix-compta", id: "tenant-cpt-1", nom: null };

const config = {
  profil: "profil-test",
  environnement: "prod",
  clientId: "client-test",
  clientSecret: null,
  redirectUri: "http://127.0.0.1:0/callback",
  pkce: "required",
  famillesActives: ["hubbix-compta"],
  groupesQuota: new Map([["groupe-test", { maxPerDay: 100, reserve: 5, minIntervalMs: 0, resetTimezone: "UTC" }]]),
  dossiers: { prod: [DOSSIER_CPT], preprod: [] },
  aliasDefaut: "cpt-demo",
  redactPii: false,
  identiteStore: identiteStore("/tmp/ebp-mcp-stdio-script", "profil-test", "prod", "client-test"),
  abonnementPourFamille: () => ({ cle: null, groupeQuota: "groupe-test" }),
};

const transport = {
  async executer() {
    throw new Error("Transport HTTP appelé alors qu'aucun test stdio ne devrait en avoir besoin.");
  },
};
const quota = {
  async reserveDepart() {},
  async getStatut() {
    return { quotaJourRestant: 100, quotaUtilisable: 100, quotaEstime: false };
  },
  async enregistrerCooldown429() {},
  async incrementerAuth() {},
  async getCompteurAuth() {
    return 0;
  },
};
const hookToken = {
  async obtenirToken() {
    return { accessToken: "acc", generation: 1 };
  },
  async invaliderToken() {},
};
const tokenStore = {
  async read() {
    return null;
  },
  async write() {},
  async clear() {},
};

const depsPartage = {
  config,
  http: { transport, clock, quota, hookToken },
  cache: new CacheSource(clock),
  clock,
  tokenStore,
  journal: creerJournalMcpStderr(),
};

const fabrique = creerFabriqueServeur(depsPartage, { mode: "mock" });
await demarrerStdio(fabrique);
