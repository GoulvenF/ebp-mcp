// Fixtures communes aux tests du mode mock (T13-1) : construit une pile RÉELLE (config résolue,
// stockage fichier, verrous, quota, hook token/cycle d'auth T06) branchée sur `creerTransportMock`
// et `creerIdentiteMock`/`creerConsentementMock` — jamais de double factice pour ces deux couches,
// contrairement aux autres suites qui factices le transport/hookToken (D-T13-5/6/7, GOU-371).
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CacheSource,
  creerConsentementMock,
  creerGestionnaireVerrous,
  creerHookToken,
  creerIdentiteMock,
  creerJournalMcpStderr,
  creerOperationsFichierNode,
  creerQuotaStoreFichier,
  creerStoreJson,
  creerTokenStoreFichier,
  creerTransportMock,
  login,
  nomVerrouIdentite,
  PROFIL_DEMO,
  resoudreConfig,
} from "../../dist/index.js";
import type {
  ConfigResolue,
  DepsProcessusPartage,
  IdentiteMock,
  JeuMock,
} from "../../dist/index.js";
import { creerHorlogeControlee, type HorlogeControlee } from "../auth/fixtures.js";

export { creerHorlogeControlee, type HorlogeControlee } from "../auth/fixtures.js";

export async function creerRepertoireTemporaireMock(): Promise<string> {
  return mkdtemp(join(tmpdir(), "ebp-mcp-mock-"));
}

export async function nettoyerRepertoireMock(chemin: string): Promise<void> {
  await rm(chemin, { recursive: true, force: true });
}

export interface PileMock {
  readonly config: ConfigResolue;
  readonly clock: HorlogeControlee;
  readonly identite: IdentiteMock;
  readonly depsPartage: DepsProcessusPartage;
  readonly cheminTokens: string;
  /** Effectue un login complet (consentement simulé) et laisse les tokens prêts dans le store réel. */
  connecter(): Promise<void>;
}

/**
 * Construit la configuration résolue de démo (`PROFIL_DEMO`) sur une racine temporaire, puis toute
 * la pile réelle (stockage, verrous, quota fichier, hook token T06) branchée sur `creerTransportMock`
 * partageant la même `IdentiteMock` que `creerConsentementMock` (exigence de `src/mock/consentement.ts`).
 */
export async function construirePileMock(
  racine: string,
  clock: HorlogeControlee,
  jeu: JeuMock,
  /**
   * Port loopback dédié au test (D-T13-5) : `PROFIL_DEMO.redirectUri` fixe le port `8732`, qui
   * collisionnerait entre fichiers de test exécutés en parallèle si plusieurs appelaient `login()`
   * sans override ; chaque test qui appelle `connecter()` doit passer un port obtenu par
   * `portLibre()` (`tests/auth/fixtures.ts`).
   */
  redirectUriOverride?: string,
): Promise<PileMock> {
  const config = resoudreConfig({
    contenuFichier: JSON.stringify(PROFIL_DEMO),
    variablesEnv: {},
    cli: { profile: "demo", ...(redirectUriOverride !== undefined ? { redirectUri: redirectUriOverride } : {}) },
    racine,
    journal: { avertir() {} },
  });

  const identite = creerIdentiteMock();
  const transport = creerTransportMock(jeu, { identite });

  const operations = creerOperationsFichierNode();
  const verrous = creerGestionnaireVerrous({ repertoire: racine, operations, clock });
  const store = creerStoreJson({ operations });
  const cheminGenerations = join(config.identiteStore.repertoire, "generations.json");
  const cheminTokens = join(config.identiteStore.repertoire, "tokens.json");
  const tokenStore = creerTokenStoreFichier({ chemin: cheminTokens, store, operations });
  const identiteStockage = {
    profil: config.identiteStore.profil,
    environnement: config.identiteStore.environnement,
    empreinteClientId: config.identiteStore.empreinteClient,
  };
  const nomVerrou = nomVerrouIdentite(config.identiteStore.cle);

  const hookToken = creerHookToken({
    transport,
    clock,
    verrous,
    store,
    tokenStore,
    identite: identiteStockage,
    nomVerrou,
    cheminGenerations,
    profilAuth: { clientId: config.clientId },
  });

  const quota = creerQuotaStoreFichier({
    racine,
    groupesQuota: config.groupesQuota,
    verrous,
    store,
    clock,
  });

  const depsPartage: DepsProcessusPartage = {
    config,
    http: { transport, clock, quota, hookToken },
    cache: new CacheSource(clock),
    clock,
    tokenStore,
    journal: creerJournalMcpStderr(),
    claims: null,
  };

  async function connecter(): Promise<void> {
    await login(
      {
        transport,
        clock,
        verrous,
        store,
        tokenStore,
        identite: identiteStockage,
        nomVerrou,
        cheminGenerations,
        ouvrirNavigateur: creerConsentementMock(identite),
      },
      {
        environnement: config.environnement,
        profilAuth: { clientId: config.clientId, redirectUri: config.redirectUri, pkce: config.pkce },
        budgetRestant: 30,
        deadline: new Date(clock.now().getTime() + 60_000),
      },
    );
  }

  return { config, clock, identite, depsPartage, cheminTokens, connecter };
}

export async function statFichier(chemin: string) {
  return stat(chemin);
}
