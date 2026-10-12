// Preuve que la garde réseau globale (T14-1, livrable « CI sans réseau EBP ») couvre toute la
// suite : une tentative non loopback, même avalée par le test, fait échouer `vitest run` avec sa
// cible dans le message — depuis un test ordinaire comme depuis un processus enfant. Chaque cas
// lance un `vitest run` imbriqué avec la configuration réelle (`tests/garde/fixtures/vitest.config.ts`
// la reprend) sur une fixture `*.fixture.ts`. Si l'on retire `globalSetup` ou `setupFiles` de
// `vitest.config.ts`, les deux premiers cas échouent.
import { describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const VITEST = join(RACINE, "node_modules", "vitest", "vitest.mjs");
const CONFIG_FIXTURES = join(RACINE, "tests", "garde", "fixtures", "vitest.config.ts");
const MARQUEUR = Symbol.for("ebp-mcp.garde-reseau");

interface ResultatSuite {
  readonly code: number | null;
  readonly sortie: string;
}

async function executer(args: readonly string[]): Promise<ResultatSuite> {
  const enfant = spawn(process.execPath, args, { cwd: RACINE, stdio: ["ignore", "pipe", "pipe"] });
  let sortie = "";
  enfant.stdout.on("data", (d: Buffer) => (sortie += d.toString("utf8")));
  enfant.stderr.on("data", (d: Buffer) => (sortie += d.toString("utf8")));
  const code = await new Promise<number | null>((resolve) => enfant.on("exit", resolve));
  return { code, sortie };
}

function executerSuiteImbriquee(fixture: string): Promise<ResultatSuite> {
  return executer([VITEST, "run", "--config", CONFIG_FIXTURES, `tests/garde/fixtures/${fixture}`]);
}

describe("garde réseau globale de npm test (T14-1)", () => {
  it("est installée dans le worker vitest et dans un processus enfant lancé sans --import", async () => {
    expect((process as unknown as Record<symbol, unknown>)[MARQUEUR]).toBe(true);
    const enfant = await executer(["-e", "process.stdout.write(String(process[Symbol.for('ebp-mcp.garde-reseau')]))"]);
    expect(enfant).toEqual({ code: 0, sortie: "true" });
  });

  it("fait échouer la suite sur une tentative non loopback depuis un test ordinaire", async () => {
    const r = await executerSuiteImbriquee("tentative-test.fixture.ts");
    expect(r.sortie).toContain("1 passed");
    expect(r.sortie).toContain(
      "Garde réseau : 1 tentative(s) d'émission non loopback pendant les tests : http://garde-test.invalid/",
    );
    expect(r.code).toBe(1);
  }, 60_000);

  it("fait échouer la suite sur une tentative non loopback depuis un processus enfant", async () => {
    const r = await executerSuiteImbriquee("tentative-enfant.fixture.ts");
    expect(r.sortie).toContain("1 passed");
    expect(r.sortie).toContain(
      "Garde réseau : 1 tentative(s) d'émission non loopback pendant les tests : net:garde-enfant.invalid",
    );
    expect(r.code).toBe(1);
  }, 60_000);

  it("laisse la suite verte quand seules des connexions loopback ont lieu", async () => {
    const r = await executerSuiteImbriquee("loopback.fixture.ts");
    expect(r.sortie).toContain("1 passed");
    expect(r.sortie).not.toContain("Garde réseau");
    expect(r.code).toBe(0);
  }, 60_000);
});
