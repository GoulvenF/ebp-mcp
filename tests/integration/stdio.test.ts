import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, describe, expect, it } from "vitest";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "stdio-script.mjs");

interface MessageJsonRpc {
  readonly jsonrpc: "2.0";
  readonly id?: number | string;
  readonly method?: string;
  readonly result?: unknown;
  readonly error?: { readonly code: number; readonly message: string; readonly data?: unknown };
}

/**
 * Harnais JSON-RPC manuel sur un vrai processus enfant (D-T12-14, issue T12-3) : écrit des
 * requêtes à la main sur `stdin` et lit `stdout` ligne à ligne, sans passer par
 * `StdioClientTransport`, pour pouvoir vérifier chaque ligne brute plutôt que de faire confiance
 * au parsing interne du SDK.
 */
function creerHarnaisStdio(enfant: ChildProcessWithoutNullStreams) {
  let prochainId = 1;
  const enAttente = new Map<number, (message: MessageJsonRpc) => void>();
  const lignesBrutesStdout: string[] = [];
  const lignesInvalides: string[] = [];

  const rl = createInterface({ input: enfant.stdout });
  rl.on("line", (ligne) => {
    if (ligne.trim().length === 0) return;
    lignesBrutesStdout.push(ligne);
    let message: MessageJsonRpc;
    try {
      message = JSON.parse(ligne) as MessageJsonRpc;
    } catch {
      lignesInvalides.push(ligne);
      return;
    }
    if (message.jsonrpc !== "2.0" || (message.id === undefined && message.method === undefined)) {
      lignesInvalides.push(ligne);
      return;
    }
    if (typeof message.id === "number") {
      enAttente.get(message.id)?.(message);
      enAttente.delete(message.id);
    }
  });

  function requete(method: string, params?: unknown): Promise<MessageJsonRpc> {
    const id = prochainId++;
    const promesse = new Promise<MessageJsonRpc>((resolve) => enAttente.set(id, resolve));
    enfant.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    return promesse;
  }

  function notification(method: string, params?: unknown): void {
    enfant.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
  }

  return { requete, notification, lignesBrutesStdout, lignesInvalides };
}

describe("stdio (fiche T12, D-T12-14)", () => {
  let enfant: ChildProcessWithoutNullStreams | undefined;

  afterEach(async () => {
    enfant?.stdin.end();
    enfant = undefined;
  });

  it("initialize, tools/list, tools/call, resources/list et read fonctionnent sur un vrai processus enfant ; chaque ligne de stdout est un message JSON-RPC valide, les journaux vont sur stderr, et l'enfant s'arrête proprement à la fermeture", async () => {
    enfant = spawn(process.execPath, [SCRIPT], { stdio: ["pipe", "pipe", "pipe"] });
    const lignesStderr: string[] = [];
    enfant.stderr.on("data", (chunk: Buffer) => {
      lignesStderr.push(chunk.toString("utf8"));
    });
    const harnais = creerHarnaisStdio(enfant);

    const init = await harnais.requete("initialize", {
      protocolVersion: LATEST_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "stdio-test-client", version: "0.0.0" },
    });
    expect(init.error).toBeUndefined();
    const capacites = (init.result as { capabilities: { tools?: unknown; resources?: unknown; prompts?: unknown } }).capabilities;
    expect(capacites.tools).toBeDefined();
    expect(capacites.resources).toBeDefined();
    expect(capacites.prompts).toBeUndefined();
    harnais.notification("notifications/initialized");

    const listeOutils = await harnais.requete("tools/list");
    expect((listeOutils.result as { tools: unknown[] }).tools).toHaveLength(17);

    const appelReussi = await harnais.requete("tools/call", { name: "ebp_statut", arguments: {} });
    expect(appelReussi.error).toBeUndefined();
    const contenuAppel = appelReussi.result as { isError: boolean; structuredContent: { meta: { mode: string } } };
    expect(contenuAppel.isError).toBe(false);
    expect(contenuAppel.structuredContent.meta.mode).toBe("mock");

    const listeRessources = await harnais.requete("resources/list");
    const uris = (listeRessources.result as { resources: { uri: string }[] }).resources.map((r) => r.uri);
    expect(uris).toContain("ebp://glossaire");

    const lectureRessource = await harnais.requete("resources/read", { uri: "ebp://glossaire" });
    const contenuLecture = lectureRessource.result as { contents: { text: string }[] };
    expect(contenuLecture.contents[0]!.text.length).toBeGreaterThan(0);

    // Appel invalide : force une écriture stderr (journal d'erreur), jamais sur stdout.
    const appelInvalide = await harnais.requete("tools/call", { name: "rechercher_tiers", arguments: { cle_inconnue: true } });
    const contenuInvalide = appelInvalide.result as { isError: boolean };
    expect(contenuInvalide.isError).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(harnais.lignesInvalides).toEqual([]);
    expect(harnais.lignesBrutesStdout.length).toBeGreaterThan(0);
    expect(lignesStderr.join("")).toContain("rechercher_tiers");

    const sortie = new Promise<number | null>((resolve) => enfant!.once("exit", (code) => resolve(code)));
    enfant.stdin.end();
    const code = await sortie;
    expect(code).toBe(0);
  });
});
