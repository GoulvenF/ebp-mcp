// Fixtures communes aux tests d'acceptation du binaire (fiche T13-3) : répertoire temporaire
// `XDG_CONFIG_HOME`/`HOME`, `config.json` synthétique écrit à la main, lancement d'un vrai
// processus enfant `node --import <garde-reseau> dist/cli.js …` (D-T13-13).
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { connect, createServer } from "node:net";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const ICI = dirname(fileURLToPath(import.meta.url));
export const GARDE_RESEAU = join(ICI, "garde-reseau.mjs");
export const CLI_DIST = join(ICI, "..", "..", "dist", "cli.js");

/** Port TCP loopback libre au moment de l'appel (mêmes garanties que `tests/auth/fixtures.ts`). */
export async function portLibre(): Promise<number> {
  return new Promise((resolve, reject) => {
    const serveur = createServer();
    serveur.once("error", reject);
    serveur.listen(0, "127.0.0.1", () => {
      const adresse = serveur.address();
      const port = typeof adresse === "object" && adresse !== null ? adresse.port : 0;
      serveur.close(() => resolve(port));
    });
  });
}

/** `true` si un `bind` sur ce port loopback réussit immédiatement (preuve de port libéré). */
export async function portEstLibre(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const serveur = createServer();
    serveur.once("error", () => resolve(false));
    serveur.listen(port, "127.0.0.1", () => serveur.close(() => resolve(true)));
  });
}

/**
 * `true` si une connexion TCP vers ce port loopback réussit (preuve qu'un `listen` est actif).
 * Volontairement une sonde par connexion, pas par `bind` : un `bind` répété pourrait voler le
 * port au processus enfant pendant qu'il tente son propre `listen`, qui sortirait alors en
 * `CONFIG_INVALID` au lieu d'ouvrir son callback (revue PR #27).
 */
export async function portEnEcoute(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host: "127.0.0.1", port });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

/** Attend, avec une borne de temps, qu'une connexion vers ce port loopback réussisse. */
export async function attendrePortEnEcoute(port: number, delaiMaxMs: number): Promise<boolean> {
  const limite = Date.now() + delaiMaxMs;
  do {
    if (await portEnEcoute(port)) return true;
    await new Promise((resolve) => setTimeout(resolve, 20));
  } while (Date.now() < limite);
  return false;
}

export interface RepertoireCliTemp {
  readonly racine: string;
  readonly xdgConfigHome: string;
  readonly home: string;
  readonly cheminConfig: string;
}

export async function creerRepertoireCliTemp(): Promise<RepertoireCliTemp> {
  const racine = await mkdtemp(join(tmpdir(), "ebp-mcp-cli-"));
  const xdgConfigHome = join(racine, "xdg");
  const home = join(racine, "home");
  await mkdir(xdgConfigHome, { recursive: true });
  await mkdir(home, { recursive: true });
  return { racine, xdgConfigHome, home, cheminConfig: join(xdgConfigHome, "ebp-mcp", "config.json") };
}

export async function nettoyerRepertoireCliTemp(rep: RepertoireCliTemp): Promise<void> {
  await rm(rep.racine, { recursive: true, force: true });
}

export interface DossierConfigSynthetique {
  readonly alias: string;
  readonly famille: "hubbix-compta" | "hubbix-gescom";
  readonly tenantId?: string;
  readonly domainId?: string;
}

export interface OptionsConfigSynthetique {
  readonly redirectUri: string;
  readonly famillesActives?: readonly string[];
  readonly minIntervalMs?: number;
  readonly dossiersProd?: readonly DossierConfigSynthetique[];
}

/** GUID factice (D-T13-x), jamais un identifiant EBP réel — même forme que `CLIENT_ID_DEMO`. */
const CLIENT_ID_SYNTHETIQUE = "11111111-1111-4111-8111-111111111111";

export async function ecrireConfigSynthetique(rep: RepertoireCliTemp, options: OptionsConfigSynthetique): Promise<void> {
  const fichier = {
    schemaVersion: 1,
    profiles: {
      default: {
        env: "prod",
        clientId: CLIENT_ID_SYNTHETIQUE,
        redirectUri: options.redirectUri,
        pkce: "required",
        enabledFamilies: options.famillesActives ?? ["hubbix-compta"],
        quotaGroup: "g",
        dossiers: { prod: options.dossiersProd ?? [], preprod: [] },
      },
    },
    quotaGroups: {
      g: { maxPerDay: 1000, reserve: 10, minIntervalMs: options.minIntervalMs ?? 0, resetTimezone: "UTC" },
    },
  };
  await mkdir(dirname(rep.cheminConfig), { recursive: true });
  await writeFile(rep.cheminConfig, JSON.stringify(fichier), "utf8");
}

export interface ResultatCli {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

export interface OptionsLancerCli {
  readonly rep: RepertoireCliTemp;
  readonly argv: readonly string[];
  readonly gardeFichier?: string;
}

/** Lance `dist/cli.js` sous la garde réseau, dans l'environnement temporaire fourni. */
export function lancerCli(options: OptionsLancerCli): ChildProcessWithoutNullStreams {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    XDG_CONFIG_HOME: options.rep.xdgConfigHome,
    HOME: options.rep.home,
  };
  if (options.gardeFichier !== undefined) {
    env.EBP_MCP_TEST_GARDE_FICHIER = options.gardeFichier;
  }
  return spawn(process.execPath, ["--import", GARDE_RESEAU, CLI_DIST, ...options.argv], {
    stdio: ["pipe", "pipe", "pipe"],
    env,
  });
}

/** Lance et attend la fin du processus (commandes non interactives : login, logout, status, dossiers). */
export async function executerCliEtAttendre(options: OptionsLancerCli): Promise<ResultatCli> {
  const enfant = lancerCli(options);
  let stdout = "";
  let stderr = "";
  enfant.stdout.on("data", (d: Buffer) => (stdout += d.toString("utf8")));
  enfant.stderr.on("data", (d: Buffer) => (stderr += d.toString("utf8")));
  enfant.stdin.end();
  const code = await new Promise<number | null>((resolve) => enfant.on("exit", resolve));
  return { code, stdout, stderr };
}
