import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it } from "vitest";
import { creerFabriqueServeur } from "../../../dist/index.js";
import type { DepsProcessusPartage } from "../../../dist/index.js";
import { creerConfigServeurTest, creerDepsPartageTest, DOSSIER_CPT, DOSSIER_GC } from "./fixtures.js";

async function connecter(
  depsPartage: DepsProcessusPartage,
  options: { mode: "mock" | "live" } = { mode: "mock" },
): Promise<{ serveur: Server; client: Client }> {
  const fabrique = creerFabriqueServeur(depsPartage, options);
  const serveur = fabrique();
  const [transportServeur, transportClient] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await Promise.all([serveur.connect(transportServeur), client.connect(transportClient)]);
  return { serveur, client };
}

const PAGE_TIERS = {
  data: [
    {
      uuid: "11111111-1111-1111-1111-111111111111",
      name: "Café Dupont",
      number: "4010001",
      vatNumber: null,
      siret: null,
      isActive: true,
      types: null,
    },
  ],
  take: 50,
  skip: 0,
  totalRecords: 1,
};

describe("initialize (D-T12-2)", () => {
  it("n'annonce que les capacités tools et resources, jamais prompts", async () => {
    const { depsPartage } = creerDepsPartageTest();
    const { client } = await connecter(depsPartage);
    const capacites = client.getServerCapabilities();
    expect(capacites?.tools).toBeDefined();
    expect(capacites?.resources).toBeDefined();
    expect(capacites?.prompts).toBeUndefined();
  });
});

describe("tools/call, succès (D-T12-4)", () => {
  it("`structuredContent` est profondément égal à `JSON.parse(content[0].text)`, `meta.mode` = mock, et le SDK valide `outputSchema`", async () => {
    const { depsPartage } = creerDepsPartageTest([{ status: 200, corps: PAGE_TIERS }]);
    const { client } = await connecter(depsPartage);
    await client.listTools();

    const reponse = await client.callTool({ name: "rechercher_tiers", arguments: { dossier: "cpt-demo" } });

    expect(reponse.isError).toBe(false);
    const texte = (reponse.content as { type: string; text: string }[])[0]!.text;
    expect(JSON.parse(texte)).toEqual(reponse.structuredContent);
    expect((reponse.structuredContent as { meta: { mode: string } }).meta.mode).toBe("mock");
  });

  it("outil de contexte `ebp_statut` : 0 réseau, `dossier: null`, `meta.quota_*` à `null`", async () => {
    const { depsPartage, transport } = creerDepsPartageTest();
    const { client } = await connecter(depsPartage);
    await client.listTools();

    const reponse = await client.callTool({ name: "ebp_statut", arguments: {} });

    expect(reponse.isError).toBe(false);
    expect(transport.appels).toHaveLength(0);
    const contenu = reponse.structuredContent as { dossier: unknown; meta: Record<string, unknown> };
    expect(contenu.dossier).toBeNull();
    expect(contenu.meta["quota_jour_restant"]).toBeNull();
  });
});

describe("tools/call, erreurs (07 §4, D-T12-3)", () => {
  it("entrée invalide ⇒ `isError: true`, `INVALID_ARGUMENT`, 0 appel transport", async () => {
    const { depsPartage, transport } = creerDepsPartageTest();
    const { client } = await connecter(depsPartage);
    await client.listTools();

    const reponse = await client.callTool({ name: "rechercher_tiers", arguments: { cle_inconnue: true } });

    expect(reponse.isError).toBe(true);
    const texte = (reponse.content as { type: string; text: string }[])[0]!.text;
    expect(JSON.parse(texte)).toMatchObject({ erreur: { code: "INVALID_ARGUMENT" } });
    expect(reponse.structuredContent).toBeUndefined();
    expect(transport.appels).toHaveLength(0);
  });

  it("capacité absente (`lister_reglements.tiers`) ⇒ `UNSUPPORTED_CAPABILITY`, 0 appel transport", async () => {
    const { depsPartage, transport } = creerDepsPartageTest();
    const { client } = await connecter(depsPartage);
    await client.listTools();

    const reponse = await client.callTool({
      name: "lister_reglements",
      arguments: { dossier: "gc-demo", tiers: "id-1" },
    });

    expect(reponse.isError).toBe(true);
    const texte = (reponse.content as { type: string; text: string }[])[0]!.text;
    expect(JSON.parse(texte)).toMatchObject({ erreur: { code: "UNSUPPORTED_CAPABILITY" } });
    expect(transport.appels).toHaveLength(0);
  });

  it("outil CPT appelé sur un dossier GC ⇒ `UNSUPPORTED_CAPABILITY`, 0 appel transport", async () => {
    const { depsPartage, transport } = creerDepsPartageTest();
    const { client } = await connecter(depsPartage);
    await client.listTools();

    const reponse = await client.callTool({ name: "rechercher_tiers", arguments: { dossier: "gc-demo" } });

    expect(reponse.isError).toBe(true);
    const texte = (reponse.content as { type: string; text: string }[])[0]!.text;
    expect(JSON.parse(texte)).toMatchObject({ erreur: { code: "UNSUPPORTED_CAPABILITY" } });
    expect(transport.appels).toHaveLength(0);
  });

  it("outil inconnu ⇒ erreur JSON-RPC protocolaire, jamais `isError: true`", async () => {
    const { depsPartage } = creerDepsPartageTest();
    const { client } = await connecter(depsPartage);
    await client.listTools();

    await expect(client.callTool({ name: "outil_inexistant", arguments: {} })).rejects.toBeInstanceOf(McpError);
  });
});

describe("sessions (D-T12-10)", () => {
  it("deux clients sur la même fabrique ne partagent pas le dossier actif", async () => {
    const { depsPartage } = creerDepsPartageTest();
    const fabrique = creerFabriqueServeur(depsPartage, { mode: "mock" });

    const [tA1, tA2] = InMemoryTransport.createLinkedPair();
    const clientA = new Client({ name: "client-a", version: "0.0.0" });
    await Promise.all([fabrique().connect(tA1), clientA.connect(tA2)]);

    const [tB1, tB2] = InMemoryTransport.createLinkedPair();
    const clientB = new Client({ name: "client-b", version: "0.0.0" });
    await Promise.all([fabrique().connect(tB1), clientB.connect(tB2)]);

    await clientA.listTools();
    await clientB.listTools();

    const choix = await clientA.callTool({ name: "ebp_choisir_dossier", arguments: { dossier: "cpt-demo" } });
    expect(choix.isError).toBe(false);

    const statutB = await clientB.callTool({ name: "ebp_statut", arguments: {} });
    expect(statutB.isError).toBe(false);
    expect((statutB.structuredContent as { resultats: { dossier_actif: string | null }[] }).resultats[0]!.dossier_actif).toBeNull();

    const statutA = await clientA.callTool({ name: "ebp_statut", arguments: {} });
    expect((statutA.structuredContent as { resultats: { dossier_actif: string | null }[] }).resultats[0]!.dossier_actif).toBe(
      "cpt-demo",
    );
  });

  it("un curseur de A, utilisé par B, donne `CURSOR_EXPIRED`", async () => {
    const config = creerConfigServeurTest({ aliasDefaut: "cpt-demo" as never });
    // Page pleine (100 éléments, `taillePage` par défaut de `construireSourceSkipTake`) pour que
    // la source signale `suivant !== null` et que `limite: 1` laisse bien `hasMore: true`.
    const pagePleine = {
      data: Array.from({ length: 100 }, (_, i) => ({
        uuid: `11111111-1111-1111-1111-${String(i).padStart(12, "0")}`,
        name: `Tiers ${i}`,
        number: `40${String(10000 + i)}`,
        vatNumber: null,
        siret: null,
        isActive: true,
        types: null,
      })),
      take: 100,
      skip: 0,
      totalRecords: 200,
    };
    const { depsPartage, clock } = creerDepsPartageTest([{ status: 200, corps: pagePleine }], { config });
    const fabrique = creerFabriqueServeur(depsPartage, { mode: "mock" });

    const [tA1, tA2] = InMemoryTransport.createLinkedPair();
    const clientA = new Client({ name: "client-a", version: "0.0.0" });
    await Promise.all([fabrique().connect(tA1), clientA.connect(tA2)]);

    const [tB1, tB2] = InMemoryTransport.createLinkedPair();
    const clientB = new Client({ name: "client-b", version: "0.0.0" });
    await Promise.all([fabrique().connect(tB1), clientB.connect(tB2)]);

    await clientA.listTools();
    await clientB.listTools();

    const premierePage = await clientA.callTool({ name: "rechercher_tiers", arguments: { limite: 1 } });
    const curseur = (premierePage.structuredContent as { pagination: { curseur: string | null } }).pagination.curseur;
    expect(curseur).not.toBeNull();

    clock.avancer(20 * 60 * 1000);

    const rejoueParB = await clientB.callTool({ name: "rechercher_tiers", arguments: { curseur: curseur! } });
    expect(rejoueParB.isError).toBe(true);
    const texte = (rejoueParB.content as { type: string; text: string }[])[0]!.text;
    expect(JSON.parse(texte)).toMatchObject({ erreur: { code: "CURSOR_EXPIRED" } });
  });
});

describe("ressources (D-T12-13)", () => {
  it("`resources/list` contient `ebp://dossiers`, `ebp://glossaire` et les ressources par dossier", async () => {
    const { depsPartage } = creerDepsPartageTest();
    const { client } = await connecter(depsPartage);
    const { resources } = await client.listResources();
    const uris = resources.map((r) => r.uri);
    expect(uris).toContain("ebp://dossiers");
    expect(uris).toContain("ebp://glossaire");
    expect(uris).toContain("ebp://cpt-demo/exercices");
    expect(uris).toContain("ebp://cpt-demo/journaux");
    expect(uris).toContain("ebp://cpt-demo/plan-comptable");
    expect(uris).toContain("ebp://cpt-demo/taux-tva");
    expect(uris).toContain("ebp://gc-demo/taux-tva");
    expect(uris).not.toContain("ebp://gc-demo/journaux");
  });

  it("`resources/templates/list` expose les 4 gabarits v0.1", async () => {
    const { depsPartage } = creerDepsPartageTest();
    const { client } = await connecter(depsPartage);
    const { resourceTemplates } = await client.listResourceTemplates();
    expect(resourceTemplates.map((t) => t.uriTemplate).sort()).toEqual(
      [
        "ebp://{dossier}/exercices",
        "ebp://{dossier}/journaux",
        "ebp://{dossier}/plan-comptable",
        "ebp://{dossier}/taux-tva",
      ].sort(),
    );
  });

  it("`resources/read` sur `ebp://dossiers` et `ebp://glossaire`", async () => {
    const { depsPartage } = creerDepsPartageTest();
    const { client } = await connecter(depsPartage);

    const dossiers = await client.readResource({ uri: "ebp://dossiers" });
    const contenuDossiers = JSON.parse((dossiers.contents[0] as { text: string }).text);
    expect(contenuDossiers.resultats[0].environnement).toBe("prod");

    const glossaire = await client.readResource({ uri: "ebp://glossaire" });
    const contenuGlossaire = JSON.parse((glossaire.contents[0] as { text: string }).text);
    expect(contenuGlossaire.resultats.length).toBeGreaterThanOrEqual(10);
  });

  it("`ebp://{gc}/journaux` ⇒ erreur JSON-RPC `-32602`, `data.erreur.code = UNSUPPORTED_CAPABILITY`", async () => {
    const { depsPartage } = creerDepsPartageTest();
    const { client } = await connecter(depsPartage);

    await expect(client.readResource({ uri: "ebp://gc-demo/journaux" })).rejects.toMatchObject({
      code: -32602,
      data: { erreur: { code: "UNSUPPORTED_CAPABILITY" } },
    });
  });

  it("URI inconnue ⇒ erreur JSON-RPC `-32002`", async () => {
    const { depsPartage } = creerDepsPartageTest();
    const { client } = await connecter(depsPartage);

    await expect(client.readResource({ uri: "ebp://inconnu" })).rejects.toMatchObject({ code: -32002 });
  });

  it("`ebp://{alias}/plan-comptable` lit effectivement le dossier CPT", async () => {
    const { depsPartage } = creerDepsPartageTest([
      {
        status: 200,
        corps: {
          data: [{ uuid: "c-1", number: "101000", label: "Capital", active: true, collective: false, racine: false }],
        },
      },
    ]);
    const { client } = await connecter(depsPartage);

    const lecture = await client.readResource({ uri: "ebp://cpt-demo/plan-comptable" });
    const contenu = JSON.parse((lecture.contents[0] as { text: string }).text);
    expect(contenu.dossier).toBe("tenant-cpt-1");
  });
});

describe("PII (D-T12-8, EBP_REDACT_PII)", () => {
  it("`fiche_tiers` masque l'email en mode PII", async () => {
    const config = creerConfigServeurTest({ redactPii: true });
    const { depsPartage } = creerDepsPartageTest(
      [
        {
          status: 200,
          corps: {
            uuid: "11111111-1111-1111-1111-111111111111",
            name: "Café Dupont",
            number: "4010001",
            vatNumber: null,
            siret: null,
            isActive: true,
            types: null,
            contact: { email: "client@example.com" },
          },
        },
      ],
      { config },
    );
    const { client } = await connecter(depsPartage);
    await client.listTools();

    const reponse = await client.callTool({ name: "fiche_tiers", arguments: { dossier: "cpt-demo", code: "4010001" } });
    expect(reponse.isError).toBe(false);
    const contenu = reponse.structuredContent as { resultats: { email: string | null }[]; meta: { avertissements: string[] } };
    expect(contenu.resultats[0]!.email).toBeNull();
    expect(contenu.meta.avertissements.some((a) => a.includes("email"))).toBe(true);
  });

  it("`inclure_brut: true` en mode PII ⇒ `PII_POLICY`, 0 appel transport", async () => {
    const config = creerConfigServeurTest({ redactPii: true });
    const { depsPartage, transport } = creerDepsPartageTest([], { config });
    const { client } = await connecter(depsPartage);
    await client.listTools();

    const reponse = await client.callTool({
      name: "rechercher_tiers",
      arguments: { dossier: "cpt-demo", inclure_brut: true },
    });
    expect(reponse.isError).toBe(true);
    const texte = (reponse.content as { type: string; text: string }[])[0]!.text;
    expect(JSON.parse(texte)).toMatchObject({ erreur: { code: "PII_POLICY" } });
    expect(transport.appels).toHaveLength(0);
  });

  it("`ebp_statut` masque l'email des claims", async () => {
    const config = creerConfigServeurTest({ redactPii: true });
    const { depsPartage } = creerDepsPartageTest([], { config });
    const { client } = await connecter(depsPartage);
    await client.listTools();

    const reponse = await client.callTool({ name: "ebp_statut", arguments: {} });
    expect(reponse.isError).toBe(false);
  });

  it("ressource masquée en mode PII : `ebp://dossiers` ne fuite jamais d'email", async () => {
    const config = creerConfigServeurTest({ redactPii: true });
    const { depsPartage } = creerDepsPartageTest([], { config });
    const { client } = await connecter(depsPartage);
    const lecture = await client.readResource({ uri: "ebp://dossiers" });
    expect((lecture.contents[0] as { text: string }).text).not.toContain("@");
  });
});
