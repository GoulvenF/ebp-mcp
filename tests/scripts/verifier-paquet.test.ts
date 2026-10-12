// Contrôle du tarball npm (T14-1) : `scripts/verifier-paquet.mjs` accepte le paquet réel construit
// et refuse un paquet factice contenant fichiers interdits et secrets. Le JWT et l'en-tête PEM
// factices sont assemblés à l'exécution, pour ne pas versionner un motif que les scanners de
// secrets signaleraient.
import { afterEach, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT = join(RACINE, "scripts", "verifier-paquet.mjs");
const HORS_LISTE = "hors liste blanche (dist/**, package.json, README.md, LICENSE)";

let repertoire: string | undefined;

afterEach(async () => {
  if (repertoire !== undefined) {
    await rm(repertoire, { recursive: true, force: true });
    repertoire = undefined;
  }
});

async function verifier(args: readonly string[]): Promise<{ code: number | null; stdout: string }> {
  const enfant = spawn(process.execPath, [SCRIPT, ...args], { cwd: RACINE, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  enfant.stdout.on("data", (d: Buffer) => (stdout += d.toString("utf8")));
  const code = await new Promise<number | null>((resolve) => enfant.on("exit", resolve));
  return { code, stdout };
}

async function paquetFactice(fichiers: Record<string, string>, files: readonly string[]): Promise<string> {
  repertoire = await mkdtemp(join(tmpdir(), "ebp-mcp-paquet-"));
  const manifeste = { name: "paquet-factice", version: "0.0.0", bin: { factice: "dist/cli.js" }, files };
  await writeFile(join(repertoire, "package.json"), JSON.stringify(manifeste));
  for (const [chemin, contenu] of Object.entries(fichiers)) {
    await mkdir(dirname(join(repertoire, chemin)), { recursive: true });
    await writeFile(join(repertoire, chemin), contenu);
  }
  return repertoire;
}

describe("scripts/verifier-paquet.mjs — contrôle du tarball npm (T14-1)", () => {
  it("accepte le paquet réel construit (dist/**, package.json, README.md, LICENSE)", async () => {
    const r = await verifier([]);
    expect(r.stdout).toMatch(/^verify:pack : \d+ fichier\(s\) examiné\(s\), aucun refus\.\n$/);
    expect(r.code).toBe(0);
  }, 60_000);

  it("refuse un paquet factice contenant fichiers interdits et secrets, sans recopier les valeurs", async () => {
    const jwt = ["eyJ" + "hbGciOiJub25lIn0", "eyJzdWIiOiJmYWN0aWNlIn0", "c2lnbmF0dXJlLWZhY3RpY2U"].join(".");
    const racine = await paquetFactice(
      {
        "dist/cli.js": "console.log('ok');\n",
        "dist/a.js": [
          `const h = { Authorization: "Bearer valeur-factice-1234" };`,
          `const j = "${jwt}";`,
          `const t = { "refresh_token": "litteral-factice" };`,
          `const contact = "quelquun@domaine-reel.fr";`,
          `const demo = "demo@example.invalid";`,
          `const schema = { access_token: z.string() };`,
        ].join("\n"),
        "dist/cle.pem": `-----BEGIN ${"PRIVATE"} KEY-----\nfactice\n`,
        "dist/tokens.json": "{}\n",
        "dist/fixtures/compta.json": "{}\n",
        "dist/x.test.js": "\n",
        "tests/a.js": "\n",
        "config.json": "{}\n",
        ".env.local": "\n",
      },
      ["dist", "tests", "config.json", ".env.local"],
    );
    const r = await verifier(["--racine", racine]);
    expect(r.stdout).toBe(
      [
        "REFUS .env.local : fichier d'environnement (.env*)",
        `REFUS .env.local : ${HORS_LISTE}`,
        "REFUS config.json : configuration ou tokens utilisateur",
        `REFUS config.json : ${HORS_LISTE}`,
        "REFUS dist/a.js:1 : en-tête Authorization: Bearer avec valeur",
        "REFUS dist/a.js:2 : JWT",
        "REFUS dist/a.js:3 : refresh_token/access_token avec valeur littérale",
        "REFUS dist/a.js:4 : adresse e-mail hors domaine d'exemple",
        "REFUS dist/cle.pem : clé ou certificat (*.pem, *.key)",
        "REFUS dist/cle.pem:1 : clé privée PEM",
        "REFUS dist/fixtures/compta.json : fixture de corpus",
        "REFUS dist/tokens.json : configuration ou tokens utilisateur",
        "REFUS dist/x.test.js : fichier de test",
        "REFUS tests/a.js : fichier de test",
        `REFUS tests/a.js : ${HORS_LISTE}`,
        "verify:pack : 10 fichier(s) examiné(s), 15 refus.",
        "",
      ].join("\n"),
    );
    expect(r.stdout).not.toContain("valeur-factice-1234");
    expect(r.stdout).not.toContain("litteral-factice");
    expect(r.stdout).not.toContain("domaine-reel.fr");
    expect(r.code).toBe(1);
  }, 60_000);

  it("refuse un paquet construit sans dist/ (cible bin absente)", async () => {
    const racine = await paquetFactice({}, ["dist"]);
    const r = await verifier(["--racine", racine]);
    expect(r.stdout).toBe(
      ["REFUS dist/cli.js : cible bin absente du paquet", "verify:pack : 1 fichier(s) examiné(s), 1 refus.", ""].join(
        "\n",
      ),
    );
    expect(r.code).toBe(1);
  }, 60_000);
});
