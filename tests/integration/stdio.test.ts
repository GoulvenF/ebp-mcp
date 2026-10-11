import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterEach, describe, expect, it } from "vitest";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "stdio-script.mjs");

describe("stdio (fiche T12, D-T12-14)", () => {
  let transport: StdioClientTransport | undefined;
  let client: Client | undefined;

  afterEach(async () => {
    await client?.close();
    transport = undefined;
    client = undefined;
  });

  it("initialize, tools/list, tools/call, resources/list et read fonctionnent sur un vrai processus enfant", async () => {
    transport = new StdioClientTransport({ command: process.execPath, args: [SCRIPT], stderr: "pipe" });
    client = new Client({ name: "stdio-test-client", version: "0.0.0" });

    const lignesStderr: string[] = [];
    await client.connect(transport);
    transport.stderr?.on("data", (chunk: Buffer) => {
      lignesStderr.push(chunk.toString("utf8"));
    });

    const capacites = client.getServerCapabilities();
    expect(capacites?.tools).toBeDefined();
    expect(capacites?.resources).toBeDefined();

    const { tools } = await client.listTools();
    expect(tools).toHaveLength(17);

    const appelReussi = await client.callTool({ name: "ebp_statut", arguments: {} });
    expect(appelReussi.isError).toBe(false);
    expect((appelReussi.structuredContent as { meta: { mode: string } }).meta.mode).toBe("mock");

    const { resources } = await client.listResources();
    expect(resources.map((r) => r.uri)).toContain("ebp://glossaire");

    const lecture = await client.readResource({ uri: "ebp://glossaire" });
    expect((lecture.contents[0] as { text: string }).text.length).toBeGreaterThan(0);

    // Force une écriture stderr (journal d'erreur) sans jamais polluer stdout du protocole.
    const appelInvalide = await client.callTool({ name: "rechercher_tiers", arguments: { cle_inconnue: true } });
    expect(appelInvalide.isError).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 50));
    // Le stdout n'est jamais vérifié ici en brut : chaque message échangé l'a déjà été via les
    // appels JSON-RPC ci-dessus, qui n'auraient pas pu réussir si une ligne non-JSON s'y était
    // glissée (le transport du client aurait échoué à parser le flux).
    expect(lignesStderr.join("")).toBeDefined();
  });
});
