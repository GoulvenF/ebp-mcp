import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { resoudreConfig, schemaFichierConfig } from "../../dist/config/index.js";
import { journalEspion } from "./fixtures.js";

const repoRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const cheminDemo = path.join(repoRoot, "examples", "config.demo.json");

describe("examples/config.demo.json", () => {
  it("est valide pour le schéma", async () => {
    const contenu = await readFile(cheminDemo, "utf8");
    const resultat = schemaFichierConfig.safeParse(JSON.parse(contenu));
    expect(resultat.success).toBe(true);
  });

  it("se résout sans avertissement", async () => {
    const contenu = await readFile(cheminDemo, "utf8");
    const journal = journalEspion();
    const config = resoudreConfig({
      contenuFichier: contenu,
      variablesEnv: {},
      cli: {},
      racine: "/config-racine",
      journal,
    });
    expect(journal.messages).toEqual([]);
    expect(config.profil).toBe("default");
  });

  it("ses deux dossiers prod se résolvent par alias, la liste preprod ne voit pas les alias de prod", async () => {
    const contenu = await readFile(cheminDemo, "utf8");
    const config = resoudreConfig({
      contenuFichier: contenu,
      variablesEnv: {},
      cli: { env: "prod" },
      racine: "/config-racine",
      journal: journalEspion(),
    });
    const aliasProd = config.dossiers.prod.map((d) => d.alias);
    expect(aliasProd).toEqual(["demo-cpt", "demo-gc"]);
    const aliasPreprod = config.dossiers.preprod.map((d) => d.alias);
    for (const alias of aliasProd) {
      expect(aliasPreprod.includes(alias)).toBe(false);
    }
  });
});
