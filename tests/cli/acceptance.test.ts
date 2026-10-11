// Tests d'acceptation du binaire `ebp-mcp` (fiche T13-3, 07 §12) : vrais processus enfants
// (`node --import <garde-reseau> dist/cli.js …`), un `XDG_CONFIG_HOME`/`HOME` temporaire par
// scénario, et un `config.json` synthétique écrit à la main. Un test nommé par point de la fiche.
import { readFile, stat } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  CLI_DIST,
  GARDE_RESEAU,
  creerRepertoireCliTemp,
  ecrireConfigSynthetique,
  executerCliEtAttendre,
  lancerCli,
  nettoyerRepertoireCliTemp,
  portEstLibre,
  portLibre,
  type RepertoireCliTemp,
} from "./fixtures.js";

/** Même port de démo que `examples/config.demo.json` : aucun GUID réel, synthétique (07 §2). */
const GUID_DEMO_CPT = "11111111-1111-4111-8111-111111111111";
const GUID_DEMO_GC = "22222222-2222-4222-8222-222222222222";
const GUID_INCONNU = "99999999-0000-0000-0000-000000000000";

async function lireTentativesGarde(chemin: string): Promise<string[]> {
  try {
    const contenu = await readFile(chemin, "utf8");
    return contenu.split("\n").filter((l) => l.length > 0);
  } catch (erreur) {
    if ((erreur as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw erreur;
  }
}

function envPourClient(rep: RepertoireCliTemp, gardeFichier?: string): Record<string, string> {
  return {
    HOME: rep.home,
    XDG_CONFIG_HOME: rep.xdgConfigHome,
    ...(gardeFichier !== undefined ? { EBP_MCP_TEST_GARDE_FICHIER: gardeFichier } : {}),
  };
}

function creerTransportClient(rep: RepertoireCliTemp, argv: readonly string[], gardeFichier?: string): StdioClientTransport {
  return new StdioClientTransport({
    command: process.execPath,
    args: ["--import", GARDE_RESEAU, CLI_DIST, ...argv],
    env: envPourClient(rep, gardeFichier),
    stderr: "pipe",
  });
}

describe("ebp-mcp — 1. aide et usage", () => {
  let rep: RepertoireCliTemp;
  beforeEach(async () => {
    rep = await creerRepertoireCliTemp();
  });
  afterEach(async () => {
    await nettoyerRepertoireCliTemp(rep);
  });

  it("--help global donne le code 0 et une aide non vide sur stdout", async () => {
    const r = await executerCliEtAttendre({ rep, argv: ["--help"] });
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("Usage : ebp-mcp");
  });

  it("--version donne le code 0 et une ligne de version non vide", async () => {
    const r = await executerCliEtAttendre({ rep, argv: ["--version"] });
    expect(r.code).toBe(0);
    expect(r.stdout.trim().length).toBeGreaterThan(0);
  });

  it("l'aide d'une commande (ex. login --help) donne le code 0", async () => {
    const r = await executerCliEtAttendre({ rep, argv: ["login", "--help"] });
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("ebp-mcp login");
  });

  it("l'aide de chaque autre commande donne aussi le code 0", async () => {
    for (const commande of ["serve", "logout", "status", "dossiers"]) {
      const r = await executerCliEtAttendre({ rep, argv: [commande, "--help"] });
      expect(r.code, `aide de ${commande}`).toBe(0);
    }
  });

  it("une commande inconnue donne le code 2 sur stderr, avec une aide courte", async () => {
    const r = await executerCliEtAttendre({ rep, argv: ["bogus"] });
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("INVALID_ARGUMENT");
    expect(r.stderr).toContain("ebp-mcp --help");
  });

  it("une option inconnue donne le code 2 sur stderr, avec une aide courte", async () => {
    const r = await executerCliEtAttendre({ rep, argv: ["status", "--option-inconnue"] });
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("INVALID_ARGUMENT");
    expect(r.stderr).toContain("ebp-mcp --help");
  });
});

describe("ebp-mcp — 2. démarrage sans token (PROFIL_DEMO via --mock, aucun config.json)", () => {
  let rep: RepertoireCliTemp;
  let gardeFichier: string;

  beforeEach(async () => {
    rep = await creerRepertoireCliTemp();
    gardeFichier = `${rep.racine}/garde.log`;
  });

  afterEach(async () => {
    await nettoyerRepertoireCliTemp(rep);
  });

  it("status --mock --json indique l'auth absente (code 0), puis un Client SDK réel sur serve --mock obtient initialize, 17 outils, ebp_statut en meta.mode=mock, puis un outil métier qui rend AUTH_REQUIRED", async () => {
    const statut = await executerCliEtAttendre({ rep, argv: ["status", "--mock", "--json"], gardeFichier });
    expect(statut.code).toBe(0);
    expect((JSON.parse(statut.stdout) as { auth: { state: string } }).auth.state).toBe("absent");

    const transport = creerTransportClient(rep, ["serve", "--mock"], gardeFichier);
    const client = new Client({ name: "test-acceptation", version: "0.0.0" });
    try {
      await client.connect(transport);
      const outils = await client.listTools();
      expect(outils.tools).toHaveLength(17);

      const statutOutil = await client.callTool({ name: "ebp_statut", arguments: {} });
      expect(statutOutil.isError).toBe(false);
      expect((statutOutil.structuredContent as { meta: { mode: string } }).meta.mode).toBe("mock");

      // `demo-cpt` vient du profil de démo intégré (`PROFIL_DEMO`, D-T13-4) : aucun `config.json`
      // n'existe sur disque dans ce test, donc la résolution du dossier aboutit avant le contrôle
      // d'authentification, qui rend ensuite `AUTH_REQUIRED` (aucun token, D-T12-3).
      const appelMetier = await client.callTool({
        name: "rechercher_tiers",
        arguments: { dossier: "demo-cpt", inclure_brut: false, limite: 10 },
      });
      expect(appelMetier.isError).toBe(true);
      expect(JSON.stringify(appelMetier.content)).toContain("AUTH_REQUIRED");
    } finally {
      await client.close();
    }
    expect(await lireTentativesGarde(gardeFichier)).toEqual([]);
  });
});

describe("ebp-mcp — parcours hors ligne complet (points 3 à 9, une seule session, D-T13-10 à D-T13-13)", () => {
  let rep: RepertoireCliTemp;
  let gardeFichier: string;

  beforeAll(async () => {
    rep = await creerRepertoireCliTemp();
    gardeFichier = `${rep.racine}/garde.log`;
    const redirectUri = `http://127.0.0.1:${await portLibre()}/callback`;
    // Seule `hubbix-compta` est active : le sous-test « famille inactive » de 4 utilise
    // `hubbix-gescom`, non activé pour ce profil.
    await ecrireConfigSynthetique(rep, { famillesActives: ["hubbix-compta"], redirectUri });
  });

  afterAll(async () => {
    await nettoyerRepertoireCliTemp(rep);
  });

  it("3. login --mock donne le code 0, écrit les tokens sous <racine>/mock/ en mode 0600, sans toucher à l'identité live", async () => {
    const r = await executerCliEtAttendre({ rep, argv: ["login", "--mock"], gardeFichier });
    expect(r.code).toBe(0);

    const dossierMockAuth = `${rep.xdgConfigHome}/ebp-mcp/mock/auth`;
    const { readdir } = await import("node:fs/promises");
    const [cle] = await readdir(dossierMockAuth);
    const cheminTokens = `${dossierMockAuth}/${cle}/tokens.json`;
    const infos = await stat(cheminTokens);
    expect(infos.mode & 0o777).toBe(0o600);

    const dossierLiveAuth = `${rep.xdgConfigHome}/ebp-mcp/auth`;
    await expect(stat(dossierLiveAuth)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("4. dossiers add valide à distance (simulé) : GUID inconnu (code 1, config inchangée), famille inactive (code 2), GUID de démo persisté (code 0), alias en double (code 2)", async () => {
    const avant = await readFile(rep.cheminConfig, "utf8");

    const ajoutInconnu = await executerCliEtAttendre({
      rep,
      argv: ["dossiers", "add", "--mock", "--famille", "hubbix-compta", "--id", GUID_INCONNU, "--alias", "x"],
      gardeFichier,
    });
    expect(ajoutInconnu.code).toBe(1);
    expect(await readFile(rep.cheminConfig, "utf8")).toBe(avant);

    const familleInactive = await executerCliEtAttendre({
      rep,
      argv: ["dossiers", "add", "--mock", "--famille", "hubbix-gescom", "--id", GUID_DEMO_CPT, "--alias", "y"],
      gardeFichier,
    });
    expect(familleInactive.code).toBe(2);

    const ajoutValide = await executerCliEtAttendre({
      rep,
      argv: ["dossiers", "add", "--mock", "--famille", "hubbix-compta", "--id", GUID_DEMO_CPT, "--alias", "demo-cpt"],
      gardeFichier,
    });
    expect(ajoutValide.code).toBe(0);
    expect(await readFile(rep.cheminConfig, "utf8")).not.toBe(avant);

    const aliasDouble = await executerCliEtAttendre({
      rep,
      argv: ["dossiers", "add", "--mock", "--famille", "hubbix-compta", "--id", GUID_DEMO_CPT, "--alias", "demo-cpt"],
      gardeFichier,
    });
    expect(aliasDouble.code).toBe(2);
  });

  it("5. dossiers list --mock --json contient le dossier ajouté", async () => {
    const r = await executerCliEtAttendre({ rep, argv: ["dossiers", "list", "--mock", "--json"], gardeFichier });
    expect(r.code).toBe(0);
    const resultat = JSON.parse(r.stdout) as { dossiers: { alias: string }[] };
    expect(resultat.dossiers.map((d) => d.alias)).toContain("demo-cpt");
  });

  it("6. serve via StdioClientTransport : initialize, 17 outils, tools/call métier réussi (meta.mode=mock), resources/list et resources/read, sans erreur de parsing, journaux sur stderr", async () => {
    const transport = creerTransportClient(rep, ["serve", "--mock"], gardeFichier);
    const erreursTransport: unknown[] = [];
    transport.onerror = (e) => erreursTransport.push(e);
    const client = new Client({ name: "test-acceptation", version: "0.0.0" });
    client.onerror = (e) => erreursTransport.push(e);
    let stderrTexte = "";
    transport.stderr?.on("data", (d: Buffer) => (stderrTexte += d.toString("utf8")));

    try {
      await client.connect(transport);
      const init = await client.getServerVersion();
      expect(init).toBeDefined();

      const outils = await client.listTools();
      expect(outils.tools).toHaveLength(17);

      const appel = await client.callTool({
        name: "rechercher_tiers",
        arguments: { dossier: "demo-cpt", inclure_brut: false, limite: 10 },
      });
      expect(appel.isError).toBe(false);
      expect((appel.structuredContent as { meta: { mode: string } }).meta.mode).toBe("mock");

      const ressources = await client.listResources();
      expect(ressources.resources.length).toBeGreaterThan(0);
      const lecture = await client.readResource({ uri: ressources.resources[0]!.uri });
      expect(lecture.contents.length).toBeGreaterThan(0);

      expect(erreursTransport).toEqual([]);
    } finally {
      await client.close();
    }
    expect(stderrTexte).not.toContain("SyntaxError");
  });

  // Point 8 avant 7 : la vérification « outil métier -> AUTH_REQUIRED » de 8 a besoin du dossier
  // `demo-cpt` encore déclaré (D-T12-3 : résolution du dossier avant le contrôle d'authentification) ;
  // 7 le retire ensuite. Chaque test garde son numéro de la fiche, l'ordre de déclaration suit l'état
  // partagé de cette session unique, pas la numérotation.
  it("8. logout : code 0, tokens.json supprimé et generations.json conservé ; ensuite dossiers add --mock donne le code 3 sans modifier la config, et un outil métier en serve --mock rend AUTH_REQUIRED", async () => {
    const { readdir } = await import("node:fs/promises");
    const dossierMockAuth = `${rep.xdgConfigHome}/ebp-mcp/mock/auth`;
    const [cle] = await readdir(dossierMockAuth);
    const cheminAuth = `${dossierMockAuth}/${cle}`;

    const r = await executerCliEtAttendre({ rep, argv: ["logout", "--mock"], gardeFichier });
    expect(r.code).toBe(0);
    await expect(stat(`${cheminAuth}/tokens.json`)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(stat(`${cheminAuth}/generations.json`)).resolves.toBeDefined();

    const avant = await readFile(rep.cheminConfig, "utf8");
    const ajout = await executerCliEtAttendre({
      rep,
      argv: ["dossiers", "add", "--mock", "--famille", "hubbix-compta", "--id", GUID_INCONNU, "--alias", "autre-alias"],
      gardeFichier,
    });
    expect(ajout.code).toBe(3);
    expect(await readFile(rep.cheminConfig, "utf8")).toBe(avant);

    const transport = creerTransportClient(rep, ["serve", "--mock"], gardeFichier);
    const client = new Client({ name: "test-acceptation", version: "0.0.0" });
    try {
      await client.connect(transport);
      const appel = await client.callTool({
        name: "rechercher_tiers",
        arguments: { dossier: "demo-cpt", inclure_brut: false, limite: 10 },
      });
      expect(appel.isError).toBe(true);
      expect(JSON.stringify(appel.content)).toContain("AUTH_REQUIRED");
    } finally {
      await client.close();
    }
  });

  it("7. dossiers remove : code 0, efface le défaut s'il visait ce dossier, alias absent code 2", async () => {
    const absent = await executerCliEtAttendre({
      rep,
      argv: ["dossiers", "remove", "--mock", "--alias", "alias-absent"],
      gardeFichier,
    });
    expect(absent.code).toBe(2);

    const retrait = await executerCliEtAttendre({
      rep,
      argv: ["dossiers", "remove", "--mock", "--alias", "demo-cpt"],
      gardeFichier,
    });
    expect(retrait.code).toBe(0);
    const liste = await executerCliEtAttendre({ rep, argv: ["dossiers", "list", "--mock", "--json"], gardeFichier });
    const resultat = JSON.parse(liste.stdout) as { dossiers: unknown[]; dossier_defaut: string | null };
    expect(resultat.dossiers).toHaveLength(0);
    expect(resultat.dossier_defaut).toBeNull();
  });

  it("9. aucune émission vers internet sur toute la session mock, et aucune ligne de stdout hors JSON-RPC en serve", async () => {
    expect(await lireTentativesGarde(gardeFichier)).toEqual([]);

    const r = await executerCliEtAttendre({ rep, argv: ["serve", "--mock"], gardeFichier });
    expect(await lireTentativesGarde(gardeFichier)).toEqual([]);
    for (const ligne of r.stdout.split("\n").filter((l) => l.length > 0)) {
      expect(() => JSON.parse(ligne)).not.toThrow();
    }
  });
});

describe("ebp-mcp — 9 (complément) : serve live sans token, aucune émission réseau", () => {
  let rep: RepertoireCliTemp;
  let gardeFichier: string;

  beforeEach(async () => {
    rep = await creerRepertoireCliTemp();
    gardeFichier = `${rep.racine}/garde.log`;
    await ecrireConfigSynthetique(rep, {
      redirectUri: `http://127.0.0.1:${await portLibre()}/callback`,
      dossiersProd: [{ alias: "demo-cpt", famille: "hubbix-compta", tenantId: GUID_DEMO_CPT }],
    });
  });

  afterEach(async () => {
    await nettoyerRepertoireCliTemp(rep);
  });

  it("un outil métier en serve live (sans --mock, aucun token) rend AUTH_REQUIRED sans émettre vers internet", async () => {
    const transport = creerTransportClient(rep, ["serve"], gardeFichier);
    const client = new Client({ name: "test-acceptation", version: "0.0.0" });
    try {
      await client.connect(transport);
      const appel = await client.callTool({
        name: "rechercher_tiers",
        arguments: { dossier: "demo-cpt", inclure_brut: false, limite: 10 },
      });
      expect(appel.isError).toBe(true);
      expect(JSON.stringify(appel.content)).toContain("AUTH_REQUIRED");
    } finally {
      await client.close();
    }
    expect(await lireTentativesGarde(gardeFichier)).toEqual([]);
  });
});

describe("ebp-mcp — 10. SIGTERM pendant serve (appel bloqué sur une attente de quota)", () => {
  let rep: RepertoireCliTemp;
  let client: Client | undefined;

  beforeEach(async () => {
    rep = await creerRepertoireCliTemp();
    await ecrireConfigSynthetique(rep, {
      redirectUri: `http://127.0.0.1:${await portLibre()}/callback`,
      // Assez long pour que le second appel reste bloqué quelques centaines de ms avant le
      // SIGTERM, assez court pour rester largement sous `DEADLINE_OUTIL_MS` (60 000 ms, 07 §12) —
      // sinon `reserveDepart` rejette immédiatement en `deadline insuffisante` au lieu d'attendre.
      minIntervalMs: 10_000,
    });
    await executerCliEtAttendre({ rep, argv: ["login", "--mock"] });
    await executerCliEtAttendre({
      rep,
      argv: ["dossiers", "add", "--mock", "--famille", "hubbix-compta", "--id", GUID_DEMO_CPT, "--alias", "demo-cpt"],
    });
  });

  afterEach(async () => {
    await client?.close().catch(() => undefined);
    client = undefined;
    await nettoyerRepertoireCliTemp(rep);
  });

  it("sort en moins de 5 s avec le code 0, et stdout ne contient que du JSON-RPC", async () => {
    const transport = creerTransportClient(rep, ["serve", "--mock"]);
    client = new Client({ name: "test-acceptation", version: "0.0.0" });

    await client.connect(transport);

    // Accès au processus enfant réel sous-jacent au transport SDK : le SDK ne consomme que les
    // trames JSON-RPC qu'il reconnaît et n'expose ni le code de sortie du processus ni ses octets
    // stdout bruts. Un second listener `data` sur le même flux (en mode flowing) reçoit les mêmes
    // chunks que celui du SDK, sans lui retirer quoi que ce soit — c'est la seule façon de vérifier
    // à la fois le code de sortie réel et l'absence de toute ligne de stdout hors JSON-RPC.
    const processusEnfant = (transport as unknown as { _process: NodeJS.Process & { stdout: NodeJS.ReadableStream } })
      ._process;
    let stdoutBrut = "";
    processusEnfant.stdout.on("data", (d: Buffer) => (stdoutBrut += d.toString("utf8")));

    const sortieProcessus = new Promise<number | null>((resolve) => {
      (processusEnfant as unknown as { on: (event: string, cb: (code: number | null) => void) => void }).on(
        "exit",
        resolve,
      );
    });
    const sortie = new Promise<void>((resolve) => {
      // `client.onclose` (pas `transport.onclose`, que le SDK enveloppe déjà pendant `connect()`
      // pour rejeter les requêtes en attente avant d'appeler ce hook) : l'écraser après `connect()`
      // casserait ce rejet et laisserait `appelBloque` ne jamais se régler.
      client!.onclose = () => resolve();
    });

    // `dossiers add` (dans `beforeEach`) a déjà consommé une réservation de départ sur le même
    // groupe de quota : cet appel attend donc `minIntervalMs` avant son propre départ (D-T13-12).
    const appelBloque = client
      .callTool({ name: "rechercher_tiers", arguments: { dossier: "demo-cpt", inclure_brut: false, limite: 10 } })
      .catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 200));

    const pid = transport.pid;
    expect(pid).not.toBeNull();
    const debut = Date.now();
    process.kill(pid!, "SIGTERM");

    const [, , codeSortie] = await Promise.all([appelBloque, sortie, sortieProcessus]);
    expect(Date.now() - debut).toBeLessThan(5000);
    expect(codeSortie).toBe(0);
    for (const ligne of stdoutBrut.split("\n").filter((l) => l.length > 0)) {
      expect(() => JSON.parse(ligne)).not.toThrow();
    }
  }, 10_000);
});

describe("ebp-mcp — 11. SIGTERM pendant login (live, --no-browser)", () => {
  let rep: RepertoireCliTemp;
  let port: number;

  beforeEach(async () => {
    rep = await creerRepertoireCliTemp();
    port = await portLibre();
    await ecrireConfigSynthetique(rep, { redirectUri: `http://127.0.0.1:${port}/callback` });
  });

  afterEach(async () => {
    await nettoyerRepertoireCliTemp(rep);
  });

  it("sort en code 1, aucun token écrit, le port redevient libre", async () => {
    const enfant = lancerCli({ rep, argv: ["login", "--no-browser"] });
    let stderrTexte = "";
    enfant.stderr.on("data", (d: Buffer) => (stderrTexte += d.toString("utf8")));

    try {
      const limite = Date.now() + 5000;
      while (stderrTexte.length === 0 && Date.now() < limite) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(stderrTexte).toContain("http");
      expect(await portEstLibre(port)).toBe(false);
    } finally {
      enfant.kill("SIGTERM");
    }
    const code = await new Promise<number | null>((resolve) => enfant.on("exit", resolve));
    expect(code).toBe(1);

    await expect(stat(`${rep.xdgConfigHome}/ebp-mcp/auth`)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await portEstLibre(port)).toBe(true);
  }, 10_000);
});

describe("ebp-mcp — horloge réelle : pas de minuteur unref (D-T13-12)", () => {
  let rep: RepertoireCliTemp;

  beforeEach(async () => {
    rep = await creerRepertoireCliTemp();
    await ecrireConfigSynthetique(rep, {
      redirectUri: `http://127.0.0.1:${await portLibre()}/callback`,
      famillesActives: ["hubbix-compta", "hubbix-gescom"],
      minIntervalMs: 2000,
    });
  });

  afterEach(async () => {
    await nettoyerRepertoireCliTemp(rep);
  });

  it("dossiers add bloqué par minIntervalMs persiste le dossier et ne sort en code 0 qu'après l'attente", async () => {
    const connexion = await executerCliEtAttendre({ rep, argv: ["login", "--mock"] });
    expect(connexion.code).toBe(0);

    // Première réservation de départ sur le groupe de quota : passe immédiatement.
    const premier = await executerCliEtAttendre({
      rep,
      argv: ["dossiers", "add", "--mock", "--famille", "hubbix-compta", "--id", GUID_DEMO_CPT, "--alias", "a"],
    });
    expect(premier.code).toBe(0);

    // Deuxième réservation sur le même groupe de quota (partagé entre familles), dans la fenêtre
    // `minIntervalMs` : `src/cli/horloge.ts` bloquait l'event loop ouverte via `signal` jusqu'à
    // présent ; un `minuteur.unref()` laissait le processus sortir en code 0 avant la fin de
    // l'attente et donc avant la persistance — repro minimale documentée par Lead Tech :
    // `new Promise(r=>{const t=setTimeout(r,1000);t.unref()}).then(()=>console.log('done'))`
    // n'affiche rien et sort en 0. Une autre famille (GUID distinct) évite un rejet local
    // « id déjà déclaré » qui ne consommerait pas la réservation de départ attendue ici.
    const avant = Date.now();
    const second = await executerCliEtAttendre({
      rep,
      argv: ["dossiers", "add", "--mock", "--famille", "hubbix-gescom", "--id", GUID_DEMO_GC, "--alias", "b"],
    });
    const dureeMs = Date.now() - avant;
    expect(second.code).toBe(0);
    expect(dureeMs).toBeGreaterThanOrEqual(1800);

    const config = JSON.parse(await readFile(rep.cheminConfig, "utf8")) as {
      profiles: { default: { dossiers: { prod: { alias: string }[] } } };
    };
    expect(config.profiles.default.dossiers.prod.map((d) => d.alias)).toEqual(
      expect.arrayContaining(["a", "b"]),
    );
  }, 15_000);
});

describe("ebp-mcp — 12. sans config.json ni --mock", () => {
  let rep: RepertoireCliTemp;

  beforeEach(async () => {
    rep = await creerRepertoireCliTemp();
  });

  afterEach(async () => {
    await nettoyerRepertoireCliTemp(rep);
  });

  it("serve et status donnent CONFIG_INVALID (code 2) ; avec --mock et sans config, serve utilise PROFIL_DEMO", async () => {
    const serveSansConfig = await executerCliEtAttendre({ rep, argv: ["serve"] });
    expect(serveSansConfig.code).toBe(2);
    expect(serveSansConfig.stderr).toContain("CONFIG_INVALID");

    const statusSansConfig = await executerCliEtAttendre({ rep, argv: ["status"] });
    expect(statusSansConfig.code).toBe(2);
    expect(statusSansConfig.stderr).toContain("CONFIG_INVALID");

    const statusMock = await executerCliEtAttendre({ rep, argv: ["status", "--mock", "--json"] });
    expect(statusMock.code).toBe(0);
    expect((JSON.parse(statusMock.stdout) as { profil: string }).profil).toBe("demo");
  });
});
