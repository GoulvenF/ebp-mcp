// Preuve que la garde réseau (D-T13-13) bloque et enregistre réellement une tentative : sans ce
// test, « zéro tentative enregistrée » dans les tests d'acceptation ne prouve rien — la garde
// pourrait aussi bien ne jamais se déclencher.
import { afterEach, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GARDE_RESEAU } from "./fixtures.js";

let repertoire: string | undefined;

afterEach(async () => {
  if (repertoire !== undefined) {
    await rm(repertoire, { recursive: true, force: true });
    repertoire = undefined;
  }
});

async function executerScriptSousGarde(script: string): Promise<{ code: number | null; fichier: string }> {
  repertoire = await mkdtemp(join(tmpdir(), "ebp-mcp-garde-"));
  const fichier = join(repertoire, "tentatives.log");
  const enfant = spawn(process.execPath, ["--import", GARDE_RESEAU, "-e", script], {
    stdio: ["ignore", "ignore", "ignore"],
    env: { ...process.env, EBP_MCP_TEST_GARDE_FICHIER: fichier },
  });
  const code = await new Promise<number | null>((resolve) => enfant.on("exit", resolve));
  return { code, fichier };
}

async function lireTentatives(fichier: string): Promise<string[]> {
  try {
    const contenu = await readFile(fichier, "utf8");
    return contenu.split("\n").filter((l) => l.length > 0);
  } catch {
    return [];
  }
}

describe("garde réseau (tests/cli/garde-reseau.mjs, D-T13-13)", () => {
  it("bloque et enregistre un fetch() vers une origine non loopback", async () => {
    const { fichier } = await executerScriptSousGarde(
      "fetch('http://example.invalid/x').catch(() => {}); setTimeout(() => {}, 50);",
    );
    const tentatives = await lireTentatives(fichier);
    expect(tentatives).toHaveLength(1);
    expect(tentatives[0]).toContain("example.invalid");
  });

  it("bloque et enregistre un net.connect() vers une origine non loopback", async () => {
    const { fichier } = await executerScriptSousGarde(
      "require('node:net').connect({ host: 'example.invalid', port: 80 }).on('error', () => {});" +
        "setTimeout(() => {}, 50);",
    );
    const tentatives = await lireTentatives(fichier);
    expect(tentatives).toHaveLength(1);
    expect(tentatives[0]).toContain("example.invalid");
  });

  it("bloque et enregistre un dns.lookup() vers une origine non loopback", async () => {
    const { fichier } = await executerScriptSousGarde(
      "require('node:dns').lookup('example.invalid', () => {});",
    );
    const tentatives = await lireTentatives(fichier);
    expect(tentatives).toHaveLength(1);
    expect(tentatives[0]).toContain("example.invalid");
  });

  it("laisse passer une connexion loopback (127.0.0.1) sans l'enregistrer", async () => {
    const { fichier } = await executerScriptSousGarde(
      "const s = require('node:net').createServer().listen(0, '127.0.0.1', () => {" +
        "  const port = s.address().port;" +
        "  require('node:net').connect({ host: '127.0.0.1', port }).on('connect', () => { s.close(); process.exit(0); })" +
        ".on('error', () => { s.close(); process.exit(1); });" +
        "});",
    );
    const tentatives = await lireTentatives(fichier);
    expect(tentatives).toHaveLength(0);
  });
});
