/**
 * Unique endroit du CLI qui construit des dépendances concrètes (T13-3, 07 §12). Deux modes :
 * - `mock` : transport mock + identité simulée partagée (`src/mock/`), jamais `transport-fetch`.
 * - `live` : `creerTransportFetch` (07 §4), jamais importé/instancié en mode mock.
 *
 * D-T13-4 : en mode mock, l'état d'authentification (tokens, générations) et le quota vivent sous
 * `<racine>/mock/...`, distinct de `<racine>/auth/...` utilisé en live — `config.json` lui-même
 * reste unique au niveau `<racine>` (dossiers/profils persistés ne sont pas des secrets, partagés
 * entre modes). Ce sous-répertoire n'existait nulle part avant ce lot (vérifié par exploration) :
 * c'est une décision de composition du CLI, pas un fait déjà câblé par T02/T04/T06.
 *
 * D-T13-4 : sans `config.json` sur disque, `--mock` retombe sur `PROFIL_DEMO` (profil `demo` en
 * mémoire, jamais persisté) ; `configExiste: false` dans le résultat permet aux commandes
 * `dossiers add|remove` de refuser explicitement (code CLI 2) plutôt que de laisser `modifierConfig`
 * échouer plus loin avec un message moins clair. Sans `--mock` et sans fichier, aucun repli : la
 * résolution échoue normalement avec `CONFIG_INVALID` (comportement déjà présent de `resoudreConfig`
 * sur profil "default" absent, décision 07 §2 — pas un comportement ajouté par le CLI).
 */
import { join } from "node:path";
import { HOTE_IDENTITE } from "../auth/origines.js";
import { nomVerrouIdentite } from "../auth/store-generations.js";
import type { IdentiteStockage, TokenStore } from "../ports/token-store.js";
import type { LockManager } from "../ports/lock-manager.js";
import type { HttpTransport } from "../ports/http-transport.js";
import { cheminFichierConfig, racineConfig } from "../config/paths.js";
import { creerLecteurFs } from "../config/lecteur-fs.js";
import { lireVariablesEnv } from "../config/env.js";
import { resoudreConfig } from "../config/resolution.js";
import type { ConfigResolue, OptionsCli } from "../config/resolution.js";
import type { Journal } from "../config/journal.js";
import { creerOperationsFichierNode } from "../storage/operations-fichier.js";
import type { OperationsFichier } from "../storage/operations-fichier.js";
import { creerGestionnaireVerrous } from "../storage/verrou.js";
import { creerStoreJson } from "../storage/store-json.js";
import type { StoreJson } from "../storage/store-json.js";
import { creerTokenStoreFichier } from "../storage/token-store-fichier.js";
import { creerQuotaStoreFichier } from "../quota/quota-store-fichier.js";
import { creerHookToken } from "../http/auth-hook.js";
import { creerTransportFetch } from "../http/transport-fetch.js";
import { origineMetier } from "../http/origines.js";
import { creerJournalHttpStderr } from "../http/journal-http.js";
import { creerTransportMock } from "../mock/transport.js";
import type { JeuMock } from "../mock/transport.js";
import { creerIdentiteMock } from "../mock/identite.js";
import type { IdentiteMock } from "../mock/identite.js";
import { creerConsentementMock } from "../mock/consentement.js";
import { PROFIL_DEMO } from "../mock/profil-demo.js";
import { DATE_REFERENCE_DEMO, JEU_CPT_DEMO, JEU_GC_DEMO } from "../mock/donnees/index.js";
import { CacheSource } from "../pagination/cache.js";
import { creerJournalMcpStderr } from "../mcp/execution/journal.js";
import type { DepsProcessusPartage } from "../mcp/serveur/types.js";
import type { Mode } from "../domain/envelope.js";
import { creerHorlogeReelle } from "./horloge.js";
import { ErreurUsageCli } from "./exit-codes.js";

export interface OptionsCliCommunes {
  readonly profile?: string;
  readonly env?: "prod" | "preprod";
  readonly mock: boolean;
}

export interface DepsCompositionEnv {
  readonly env: NodeJS.ProcessEnv;
  readonly home: string;
}

const JOURNAL_SILENCIEUX: Journal = { avertir: () => undefined };

/** Résultat de composition (07 §12) : toutes les dépendances concrètes nécessaires aux commandes. */
export interface ContexteCli {
  readonly mode: Mode;
  readonly config: ConfigResolue;
  /** `false` si `config.json` est absent du disque — v. D-T13-4 : `dossiers add|remove` doivent refuser. */
  readonly configExiste: boolean;
  readonly cheminConfig: string;
  readonly operations: OperationsFichier;
  readonly verrous: LockManager;
  readonly store: StoreJson;
  readonly transport: HttpTransport;
  readonly tokenStore: TokenStore;
  readonly identiteStockage: IdentiteStockage;
  readonly nomVerrouAuth: string;
  readonly cheminGenerations: string;
  readonly depsPartage: DepsProcessusPartage;
  /** Présente seulement en mode mock (partagée entre transport et consentement, D-T13-6). */
  readonly identiteMock?: IdentiteMock;
}

function versOptionsCli(options: OptionsCliCommunes): OptionsCli {
  return {
    ...(options.profile !== undefined ? { profile: options.profile } : {}),
    ...(options.env !== undefined ? { env: options.env } : {}),
  };
}

/** Construit la configuration résolue, en retombant sur `PROFIL_DEMO` en mock sans fichier (D-T13-4). */
async function resoudreConfigCli(
  options: OptionsCliCommunes,
  deps: DepsCompositionEnv,
  racineAuth: string,
  racineTop: string,
): Promise<{ config: ConfigResolue; configExiste: boolean; cheminConfig: string }> {
  const cheminConfig = cheminFichierConfig(racineTop);
  const lecteur = creerLecteurFs();
  const fichier = await lecteur.lire(cheminConfig);
  const variablesEnv = lireVariablesEnv(deps.env, JOURNAL_SILENCIEUX);

  if (fichier === null && options.mock) {
    const config = resoudreConfig({
      contenuFichier: JSON.stringify(PROFIL_DEMO),
      variablesEnv,
      cli: { profile: options.profile ?? "demo", ...(options.env !== undefined ? { env: options.env } : {}) },
      racine: racineAuth,
      journal: JOURNAL_SILENCIEUX,
    });
    return { config, configExiste: false, cheminConfig };
  }

  const config = resoudreConfig({
    contenuFichier: fichier?.contenu ?? null,
    variablesEnv,
    cli: versOptionsCli(options),
    racine: racineAuth,
    journal: JOURNAL_SILENCIEUX,
  });
  return { config, configExiste: fichier !== null, cheminConfig };
}

/**
 * Construit le contexte complet d'une invocation CLI (07 §12) : une seule fonction, mode mock ou
 * live résolu explicitement par `options.mock` (jamais déduit). `racineConfig`/`cheminFichierConfig`
 * restent calculés sur la racine de configuration standard (`XDG_CONFIG_HOME`/`~/.config/ebp-mcp`,
 * 07 §2) ; seule la racine utilisée pour l'identité/les tokens/le quota diverge par mode (D-T13-10).
 */
export async function composerContexteCli(
  options: OptionsCliCommunes,
  deps: DepsCompositionEnv,
): Promise<ContexteCli> {
  const racineTop = racineConfig(deps.env, deps.home, JOURNAL_SILENCIEUX);
  const racineAuth = options.mock ? join(racineTop, "mock") : racineTop;

  const operations = creerOperationsFichierNode();
  // Sur un environnement neuf, rien n'a encore créé `racineTop` (T02/T04 supposent déjà le
  // répertoire en place dans leurs tests unitaires, pré-créé par l'appelant) : `LockManager`
  // (`src/storage/verrou.ts`) n'en crée jamais le répertoire lui-même avant d'y publier un
  // `.lock`. Seul le binaire rencontre ce cas en pratique (premier `login`/`status` sur une
  // machine sans configuration), donc la création revient à la composition du CLI, pas aux
  // couches T02/T04 dont le contrat ne change pas.
  await operations.creerRepertoire(racineTop, 0o700);
  if (options.mock) {
    await operations.creerRepertoire(racineAuth, 0o700);
  }

  const { config, configExiste, cheminConfig } = await resoudreConfigCli(options, deps, racineAuth, racineTop);

  const clock = creerHorlogeReelle();
  // Répertoire des verrous toujours au niveau `racineTop` (D-T13-10) : `config.json` est partagé
  // entre mock et live, son verrou (`NOM_VERROU_CONFIG`) doit donc l'être aussi. Les verrous
  // d'identité/quota sont nommés par hachage de leur propre clé (profil/environnement/empreinte,
  // nom de groupe) : partager ce même répertoire de verrous entre mock et live ne crée donc aucune
  // collision de fichier, seulement une sérialisation locale sans effet observable.
  const verrous = creerGestionnaireVerrous({ repertoire: racineTop, operations, clock });
  const store = creerStoreJson({ operations });

  const cheminGenerations = join(config.identiteStore.repertoire, "generations.json");
  const cheminTokens = join(config.identiteStore.repertoire, "tokens.json");
  const tokenStore = creerTokenStoreFichier({ chemin: cheminTokens, store, operations });
  const identiteStockage: IdentiteStockage = {
    profil: config.identiteStore.profil,
    environnement: config.identiteStore.environnement,
    empreinteClientId: config.identiteStore.empreinteClient,
  };
  const nomVerrouAuth = nomVerrouIdentite(config.identiteStore.cle);

  const quota = creerQuotaStoreFichier({
    racine: racineAuth,
    groupesQuota: config.groupesQuota,
    verrous,
    store,
    clock,
  });

  let transport: HttpTransport;
  let identiteMock: IdentiteMock | undefined;
  if (options.mock) {
    identiteMock = creerIdentiteMock();
    const jeu: JeuMock = { cpt: JEU_CPT_DEMO, gc: JEU_GC_DEMO };
    transport = creerTransportMock(jeu, { identite: identiteMock });
  } else {
    transport = creerTransportFetch({
      origineMetier: origineMetier(config.environnement),
      origineIdentite: HOTE_IDENTITE,
    });
  }

  const hookToken = creerHookToken({
    transport,
    clock,
    verrous,
    store,
    tokenStore,
    identite: identiteStockage,
    nomVerrou: nomVerrouAuth,
    cheminGenerations,
    profilAuth: {
      clientId: config.clientId,
      ...(config.clientSecret !== null ? { clientSecret: config.clientSecret } : {}),
    },
  });

  const depsPartage: DepsProcessusPartage = {
    config,
    http: { transport, clock, quota, hookToken, ...(options.mock ? {} : { journal: creerJournalHttpStderr() }) },
    cache: new CacheSource(clock),
    clock,
    tokenStore,
    journal: creerJournalMcpStderr(),
    claims: null,
  };

  return {
    mode: options.mock ? "mock" : "live",
    config,
    configExiste,
    cheminConfig,
    operations,
    verrous,
    store,
    transport,
    tokenStore,
    identiteStockage,
    nomVerrouAuth,
    cheminGenerations,
    depsPartage,
    ...(identiteMock !== undefined ? { identiteMock } : {}),
  };
}

export { DATE_REFERENCE_DEMO, JEU_CPT_DEMO, JEU_GC_DEMO, creerConsentementMock, ErreurUsageCli };
