// Scénario transverse 8 (09, fiche T14-3) : parcours stdio CPT + GC bout en bout — un vrai
// `StdioClientTransport` sur `serve --mock`, les deux familles actives (un dossier chacune), les
// 17 outils v0.1 appelés avec succès sur le dossier adéquat de leur famille, puis un outil CPT
// appelé sur le dossier GC (⇒ `UNSUPPORTED_CAPABILITY`), stdout strictement JSON-RPC (07 §6/§11,
// D-T13-13). Réutilise le harnais de `tests/cli/fixtures.ts` (garde réseau chargée).
import { readFile } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JEU_CPT_DEMO, TENANT_ID_DEMO_CPT, DOMAIN_ID_DEMO_GC, UUID_ECRITURE_DEMO } from "../../dist/index.js";
import {
  CLI_DIST,
  GARDE_RESEAU,
  creerRepertoireCliTemp,
  ecrireConfigSynthetique,
  executerCliEtAttendre,
  nettoyerRepertoireCliTemp,
  portLibre,
  type RepertoireCliTemp,
} from "./fixtures.js";

async function lireTentativesGarde(chemin: string): Promise<string[]> {
  try {
    const contenu = await readFile(chemin, "utf8");
    return contenu.split("\n").filter((l) => l.length > 0);
  } catch (erreur) {
    if ((erreur as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw erreur;
  }
}

/** Un appel valide par outil, un dossier par famille (mêmes 17 points que `tests/mock/integration.test.ts`). */
function appelsDesDixSeptOutils(uuidTiers1: string): ReadonlyArray<{ readonly nom: string; readonly args: Record<string, unknown> }> {
  return [
    { nom: "ebp_lister_dossiers", args: {} },
    { nom: "ebp_choisir_dossier", args: { dossier: "demo-cpt" } },
    { nom: "ebp_statut", args: {} },
    { nom: "rechercher_tiers", args: { dossier: "demo-cpt" } },
    { nom: "fiche_tiers", args: { dossier: "demo-cpt", id: uuidTiers1 } },
    { nom: "rechercher_articles", args: { dossier: "demo-gc" } },
    { nom: "fiche_article", args: { dossier: "demo-gc", code: "ART0001" } },
    { nom: "lister_documents_vente", args: { dossier: "demo-gc" } },
    { nom: "detail_document", args: { dossier: "demo-gc", numero: "F2026-010" } },
    { nom: "echeancier_clients", args: { dossier: "demo-gc" } },
    { nom: "lister_reglements", args: { dossier: "demo-gc" } },
    { nom: "lister_ecritures", args: { dossier: "demo-cpt" } },
    { nom: "detail_ecriture", args: { dossier: "demo-cpt", id: UUID_ECRITURE_DEMO } },
    { nom: "transactions_bancaires", args: { dossier: "demo-cpt", du: "2026-03-01", au: "2026-03-31" } },
    { nom: "balance_comptes", args: { dossier: "demo-cpt", du: "2026-03-01", au: "2026-03-31" } },
    { nom: "grand_livre", args: { dossier: "demo-cpt", compte: "411000", du: "2026-03-01", au: "2026-03-31" } },
    { nom: "exercices", args: { dossier: "demo-cpt" } },
  ];
}

describe("ebp-mcp — scénario transverse 8 : stdio CPT + GC bout en bout (09, D-T13-13)", () => {
  let rep: RepertoireCliTemp;
  let gardeFichier: string;

  beforeEach(async () => {
    rep = await creerRepertoireCliTemp();
    gardeFichier = `${rep.racine}/garde.log`;
    const redirectUri = `http://127.0.0.1:${await portLibre()}/callback`;
    await ecrireConfigSynthetique(rep, {
      redirectUri,
      famillesActives: ["hubbix-compta", "hubbix-gescom"],
      dossiersProd: [
        { alias: "demo-cpt", famille: "hubbix-compta", tenantId: TENANT_ID_DEMO_CPT },
        { alias: "demo-gc", famille: "hubbix-gescom", domainId: DOMAIN_ID_DEMO_GC },
      ],
    });
  });

  afterEach(async () => {
    await nettoyerRepertoireCliTemp(rep);
  });

  it(
    "login --mock puis serve --mock via StdioClientTransport : les 17 outils réussissent chacun sur le dossier de " +
      "leur famille, un outil CPT (`rechercher_tiers`) sur le dossier GC rend UNSUPPORTED_CAPABILITY, et stdout " +
      "ne porte que du JSON-RPC (aucune erreur de parsing SDK, aucun fragment hors protocole sur stderr)",
    async () => {
      const login = await executerCliEtAttendre({ rep, argv: ["login", "--mock"], gardeFichier });
      expect(login.code).toBe(0);

      const transport = new StdioClientTransport({
        command: process.execPath,
        args: ["--import", GARDE_RESEAU, CLI_DIST, "serve", "--mock"],
        env: { HOME: rep.home, XDG_CONFIG_HOME: rep.xdgConfigHome, EBP_MCP_TEST_GARDE_FICHIER: gardeFichier },
        stderr: "pipe",
      });
      const erreursTransport: unknown[] = [];
      transport.onerror = (e) => erreursTransport.push(e);
      const client = new Client({ name: "test-acceptation-cpt-gc", version: "0.0.0" });
      client.onerror = (e) => erreursTransport.push(e);
      let stderrTexte = "";
      transport.stderr?.on("data", (d: Buffer) => (stderrTexte += d.toString("utf8")));

      try {
        await client.connect(transport);
        const outils = await client.listTools();
        expect(outils.tools).toHaveLength(17);

        // UUID du tiers "4010001" du jeu de démo CPT (D-T13-1), jamais recopié d'une sortie exécutée.
        const uuidTiers1 = (
          JEU_CPT_DEMO.details["cpt-auxiliary-account-detail"] as Readonly<Record<string, { readonly uuid: string }>>
        )["4010001"]!.uuid;
        const appels = appelsDesDixSeptOutils(uuidTiers1);
        expect(appels).toHaveLength(17);

        for (const { nom, args } of appels) {
          const reponse = await client.callTool({ name: nom, arguments: args });
          expect(reponse.isError, `${nom} doit réussir sur le dossier de sa famille`).toBe(false);
        }

        // Outil CPT appelé sur le dossier GC : refus de capacité avant tout réseau supplémentaire,
        // jamais un succès partiel ni une approximation entre familles (07 §6).
        const croise = await client.callTool({ name: "rechercher_tiers", arguments: { dossier: "demo-gc" } });
        expect(croise.isError).toBe(true);
        expect(JSON.stringify(croise.content)).toContain("UNSUPPORTED_CAPABILITY");

        expect(erreursTransport).toEqual([]);
      } finally {
        await client.close();
      }
      expect(stderrTexte).not.toContain("SyntaxError");
      expect(await lireTentativesGarde(gardeFichier)).toEqual([]);
    },
  );
});
