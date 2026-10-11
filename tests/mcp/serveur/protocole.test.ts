import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it } from "vitest";
import { creerFabriqueServeur, REGISTRE_SERVICES, RESSOURCES_DOSSIER } from "../../../dist/index.js";
import type { DepsProcessusPartage, ServiceOutil } from "../../../dist/index.js";
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

/** Transaction bancaire brute EBP (02 §2) : `account.iban` ⇒ `compte_bancaire` (D-T12-8). */
function transactionBrute(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    label: "Virement reçu",
    account: { bankName: "Banque Démo", iban: "FR7630006000011234567890189", balance: null },
    operationDate: "2026-03-01",
    valueDate: "2026-03-02",
    debit: null,
    credit: "500.00",
    reference: "VIR-2026-001",
    status: 1,
    ...overrides,
  };
}

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

  it("une erreur de service citant un IBAN est masquée dans `content[0].text` (D-T12-8)", async () => {
    const config = creerConfigServeurTest({ redactPii: true });
    const { depsPartage, transport } = creerDepsPartageTest([], { config });
    const { client } = await connecter(depsPartage);
    await client.listTools();
    const iban = "FR7630006000011234567890189";

    const original = REGISTRE_SERVICES.transactions_bancaires;
    REGISTRE_SERVICES.transactions_bancaires = (async () => {
      const erreur = new Error(`Compte ${iban} invalide.`) as Error & {
        erreur: { code: string; message: string; action: string; details?: Record<string, unknown> };
      };
      erreur.erreur = {
        code: "INVALID_ARGUMENT",
        message: `Compte ${iban} invalide.`,
        action: `Corriger la valeur ${iban}.`,
        details: { champ: iban },
      };
      throw erreur;
    }) as ServiceOutil;
    try {
      const reponse = await client.callTool({
        name: "transactions_bancaires",
        arguments: { dossier: "cpt-demo", du: "2026-03-01", au: "2026-03-31" },
      });
      expect(reponse.isError).toBe(true);
      const texte = (reponse.content as { type: string; text: string }[])[0]!.text;
      expect(texte).not.toContain(iban);
      expect(texte).toContain("[masqué]");
      expect(transport.appels).toHaveLength(0);
    } finally {
      REGISTRE_SERVICES.transactions_bancaires = original;
    }
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

  it("B, sans `dossier`, n'hérite jamais du dossier actif choisi par A sur un outil métier", async () => {
    const { depsPartage, transport } = creerDepsPartageTest();
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

    // `aliasDefaut` est `null` dans `creerConfigServeurTest` (fixtures.ts) : B, sans dossier, et
    // sans dossier actif propre (sessions isolées, D-T12-10), reçoit `DOSSIER_REQUIRED` — jamais
    // le dossier choisi par A — avant tout appel transport.
    const reponseB = await clientB.callTool({ name: "rechercher_tiers", arguments: {} });
    expect(reponseB.isError).toBe(true);
    const texte = (reponseB.content as { type: string; text: string }[])[0]!.text;
    expect(JSON.parse(texte)).toMatchObject({ erreur: { code: "DOSSIER_REQUIRED" } });
    expect(transport.appels).toHaveLength(0);
  });

  it("un curseur de A, utilisé par B, donne `CURSOR_EXPIRED` ; A peut le réutiliser sans erreur", async () => {
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
    const { depsPartage } = creerDepsPartageTest(
      [
        { status: 200, corps: pagePleine },
        { status: 200, corps: pagePleine },
      ],
      { config },
    );
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

    // Isolation immédiate (D-T12-10), sans avancer l'horloge : le curseur de A est inconnu du
    // `MagasinCurseurs` de B, pas « périmé » par le temps.
    const rejoueParB = await clientB.callTool({ name: "rechercher_tiers", arguments: { curseur: curseur! } });
    expect(rejoueParB.isError).toBe(true);
    const texte = (rejoueParB.content as { type: string; text: string }[])[0]!.text;
    expect(JSON.parse(texte)).toMatchObject({ erreur: { code: "CURSOR_EXPIRED" } });

    // A, propriétaire du curseur, le réutilise toujours sans erreur dans sa propre session (même
    // appel que celui qui l'a émis : `limite` doit rester identique, sinon `CURSOR_MISMATCH`).
    const rejoueParA = await clientA.callTool({
      name: "rechercher_tiers",
      arguments: { limite: 1, curseur: curseur! },
    });
    expect(rejoueParA.isError).toBe(false);
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

  it("`resources/read` sur `ebp://{alias}/exercices`", async () => {
    const { depsPartage } = creerDepsPartageTest([
      {
        status: 200,
        corps: {
          exercices: [{ exerciceNumber: 2026, startDate: "2026-01-01", endDate: "2026-12-31", closingDate: null }],
          entry: { mode: "provisoire" },
        },
      },
    ]);
    const { client } = await connecter(depsPartage);

    const lecture = await client.readResource({ uri: "ebp://cpt-demo/exercices" });
    const contenu = JSON.parse((lecture.contents[0] as { text: string }).text);
    expect(contenu.resultats[0].exercices[0]).toMatchObject({ numero: 2026 });
  });

  it("`resources/read` sur `ebp://{alias}/journaux`", async () => {
    const { depsPartage } = creerDepsPartageTest([
      {
        status: 200,
        corps: {
          data: [{ uuid: "j-1", code: "AC", name: "Achats", journalType: { name: "Achats" }, counterpartAccount: null }],
        },
      },
    ]);
    const { client } = await connecter(depsPartage);

    const lecture = await client.readResource({ uri: "ebp://cpt-demo/journaux" });
    const contenu = JSON.parse((lecture.contents[0] as { text: string }).text);
    expect(contenu.resultats[0]).toMatchObject({ code: "AC", type: "achats" });
  });

  it("`resources/read` sur `ebp://{alias}/taux-tva` (CPT)", async () => {
    const { depsPartage } = creerDepsPartageTest([
      { status: 200, corps: { data: [{ designation: "Taux normal", rate: "20.00", isActive: true, territoriality: "France" }] } },
    ]);
    const { client } = await connecter(depsPartage);

    const lecture = await client.readResource({ uri: "ebp://cpt-demo/taux-tva" });
    const contenu = JSON.parse((lecture.contents[0] as { text: string }).text);
    expect(contenu.resultats[0]).toMatchObject({ designation: "Taux normal" });
  });

  it("`resources/read` sur `ebp://{alias}/taux-tva` (GC)", async () => {
    const { depsPartage } = creerDepsPartageTest([
      { status: 200, corps: [{ label: "Taux normal", rate: "20.00", territoriality: 0, isDefault: true }] },
    ]);
    const { client } = await connecter(depsPartage);

    const lecture = await client.readResource({ uri: "ebp://gc-demo/taux-tva" });
    const contenu = JSON.parse((lecture.contents[0] as { text: string }).text);
    expect(contenu.resultats[0]).toMatchObject({ libelle: "Taux normal", territorialite: "france" });
  });

  it("`resources/read` sur `ebp://{alias}/plan-comptable` lit effectivement le dossier CPT", async () => {
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

  it("une ressource volumineuse (>100 éléments source) donne au plus 100 résultats, `curseur: null`, `hasMore`/`completude` exacts et l'avertissement de limite (D-T12-13)", async () => {
    const donnees = Array.from({ length: 150 }, (_, i) => ({
      uuid: `j-${i}`,
      code: `J${i}`,
      name: `Journal ${i}`,
      journalType: null,
      counterpartAccount: null,
    }));
    const { depsPartage } = creerDepsPartageTest([{ status: 200, corps: { data: donnees } }]);
    const { client } = await connecter(depsPartage);

    const lecture = await client.readResource({ uri: "ebp://cpt-demo/journaux" });
    const contenu = JSON.parse((lecture.contents[0] as { text: string }).text) as {
      resultats: unknown[];
      pagination: { curseur: string | null; hasMore: boolean };
      meta: { completude: string; raison_arret: string | null; avertissements: string[] };
    };
    expect(contenu.resultats).toHaveLength(100);
    expect(contenu.pagination.curseur).toBeNull();
    expect(contenu.pagination.hasMore).toBe(true);
    expect(contenu.meta.completude).toBe("page");
    expect(contenu.meta.raison_arret).toBe("limite");
    expect(contenu.meta.avertissements).toContain("ressource limitée aux 100 premiers éléments ; aucune continuation en v0.1");
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

  it("une erreur de ressource citant un IBAN est masquée dans `data.erreur.message` (D-T12-8/D-T12-13)", async () => {
    const config = creerConfigServeurTest({ redactPii: true });
    const { depsPartage } = creerDepsPartageTest([], { config });
    const { client } = await connecter(depsPartage);
    const iban = "FR7630006000011234567890189";

    const definition = RESSOURCES_DOSSIER.find((d) => d.suffixe === "journaux")!;
    const original = definition.service;
    (definition as { service: unknown }).service = (async () => {
      const erreur = new Error(`Référentiel invalide pour le compte ${iban}.`) as Error & {
        erreur: { code: string; message: string; action: string };
      };
      erreur.erreur = {
        code: "UPSTREAM_SCHEMA_CHANGED",
        message: `Référentiel invalide pour le compte ${iban}.`,
        action: "Signaler l'écart au support.",
      };
      throw erreur;
    }) as ServiceOutil;
    try {
      await expect(client.readResource({ uri: "ebp://cpt-demo/journaux" })).rejects.toMatchObject({
        code: -32603,
        data: { erreur: { code: "UPSTREAM_SCHEMA_CHANGED" } },
      });
      try {
        await client.readResource({ uri: "ebp://cpt-demo/journaux" });
        throw new Error("readResource aurait dû rejeter.");
      } catch (erreurRejetee) {
        const message = (erreurRejetee as { data?: { erreur?: { message?: string } } }).data?.erreur?.message ?? "";
        expect(message).not.toContain(iban);
        expect(message).toContain("[masqué]");
      }
    } finally {
      (definition as { service: unknown }).service = original;
    }
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

  it(
    "`fiche_tiers` masque le téléphone en mode PII (injecté via `REGISTRE_SERVICES` : l'adapter EBP " +
      "`src/adapters/compta/tiers.ts` ne peuple jamais `telephone` en v0.1, voir le commentaire de " +
      "clôture de l'issue)",
    async () => {
      const config = creerConfigServeurTest({ redactPii: true });
      const { depsPartage, transport } = creerDepsPartageTest([], { config });
      const { client } = await connecter(depsPartage);
      await client.listTools();

      const original = REGISTRE_SERVICES.fiche_tiers;
      REGISTRE_SERVICES.fiche_tiers = (async (_deps, ctx) => ({
        dossier: ctx.dossier.id,
        resultats: [
          {
            id: "11111111-1111-1111-1111-111111111111",
            compte: "4010001",
            nom: "Café Dupont",
            types: null,
            numero_tva: null,
            siret: null,
            actif: true,
            email: null,
            telephone: "0601020304",
          },
        ],
        bruts: null,
        pagination: null,
        completude: "complete",
        raison_arret: null,
        approximatif: false,
        avertissements: [],
        sources: ["hubbix-compta:/auxiliary-accounts/{numero}"],
        appels_source: 1,
        tentatives: 1,
      })) as ServiceOutil;
      try {
        const reponse = await client.callTool({ name: "fiche_tiers", arguments: { dossier: "cpt-demo", code: "4010001" } });
        expect(reponse.isError).toBe(false);
        const contenu = reponse.structuredContent as {
          resultats: { telephone: string | null }[];
          meta: { avertissements: string[] };
        };
        expect(contenu.resultats[0]!.telephone).toBeNull();
        expect(contenu.meta.avertissements.some((a) => a.includes("telephone"))).toBe(true);
        expect(transport.appels).toHaveLength(0);
      } finally {
        REGISTRE_SERVICES.fiche_tiers = original;
      }
    },
  );

  it("`transactions_bancaires` masque l'IBAN (`compte_bancaire`) en mode PII, hors cache", async () => {
    const config = creerConfigServeurTest({ redactPii: true });
    const { depsPartage } = creerDepsPartageTest(
      [{ status: 200, corps: { data: [transactionBrute()], take: 50, skip: 0, totalRecords: 1 } }],
      { config },
    );
    const { client } = await connecter(depsPartage);
    await client.listTools();

    const reponse = await client.callTool({
      name: "transactions_bancaires",
      arguments: { dossier: "cpt-demo", du: "2026-03-01", au: "2026-03-31" },
    });
    expect(reponse.isError).toBe(false);
    const contenu = reponse.structuredContent as { resultats: { compte_bancaire: string | null }[] };
    expect(contenu.resultats[0]!.compte_bancaire).toBeNull();
  });

  it("`transactions_bancaires` : le deuxième appel identique, servi par le cache, reste masqué et ne déclenche aucun nouvel appel transport", async () => {
    const config = creerConfigServeurTest({ redactPii: true });
    const { depsPartage, transport } = creerDepsPartageTest(
      [{ status: 200, corps: { data: [transactionBrute()], take: 50, skip: 0, totalRecords: 1 } }],
      { config },
    );
    const { client } = await connecter(depsPartage);
    await client.listTools();
    const args = { dossier: "cpt-demo", du: "2026-03-01", au: "2026-03-31" };

    const premier = await client.callTool({ name: "transactions_bancaires", arguments: args });
    expect(premier.isError).toBe(false);
    expect((premier.structuredContent as { resultats: { compte_bancaire: string | null }[] }).resultats[0]!.compte_bancaire).toBeNull();
    expect(transport.appels).toHaveLength(1);

    const second = await client.callTool({ name: "transactions_bancaires", arguments: args });
    expect(second.isError).toBe(false);
    expect((second.structuredContent as { resultats: { compte_bancaire: string | null }[] }).resultats[0]!.compte_bancaire).toBeNull();
    expect(transport.appels).toHaveLength(1);
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

  it("`inclure_brut: true` après mise en cache ⇒ `PII_POLICY`, aucun nouvel appel transport (le cache n'est jamais consulté)", async () => {
    const config = creerConfigServeurTest({ redactPii: true });
    const { depsPartage, transport } = creerDepsPartageTest(
      [{ status: 200, corps: { data: [transactionBrute()], take: 50, skip: 0, totalRecords: 1 } }],
      { config },
    );
    const { client } = await connecter(depsPartage);
    await client.listTools();
    const args = { dossier: "cpt-demo", du: "2026-03-01", au: "2026-03-31" };

    const premier = await client.callTool({ name: "transactions_bancaires", arguments: args });
    expect(premier.isError).toBe(false);
    expect(transport.appels).toHaveLength(1);

    const second = await client.callTool({ name: "transactions_bancaires", arguments: { ...args, inclure_brut: true } });
    expect(second.isError).toBe(true);
    const texte = (second.content as { type: string; text: string }[])[0]!.text;
    expect(JSON.parse(texte)).toMatchObject({ erreur: { code: "PII_POLICY" } });
    expect(transport.appels).toHaveLength(1);
  });

  it("`ebp_statut` masque l'email des claims", async () => {
    const config = creerConfigServeurTest({ redactPii: true });
    const { depsPartage } = creerDepsPartageTest([], { config, claims: { email: "agent@example.com", nom: "Jean Dupont" } });
    const { client } = await connecter(depsPartage);
    await client.listTools();

    const reponse = await client.callTool({ name: "ebp_statut", arguments: {} });
    expect(reponse.isError).toBe(false);
    const contenu = reponse.structuredContent as {
      resultats: { auth: { claims: { email: string | null; nom?: string } | null } }[];
      meta: { avertissements: string[] };
    };
    expect(contenu.resultats[0]!.auth.claims?.email).toBeNull();
    expect(contenu.resultats[0]!.auth.claims?.nom).toBe("Jean Dupont");
    expect(contenu.meta.avertissements.some((a) => a.includes("claims.email"))).toBe(true);
  });

  it(
    "aucune ressource v0.1 ne porte une clé PII (email/telephone/compte_bancaire) dans son schéma : " +
      "seul le canal `meta.avertissements` (motifs texte) est masquable pour une ressource — ce test " +
      "le prouve en injectant un avertissement citant un email dans la source (voir le commentaire de " +
      "clôture de l'issue pour la conclusion complète)",
    async () => {
      const config = creerConfigServeurTest({ redactPii: true });
      const { depsPartage } = creerDepsPartageTest([], { config });
      const { client } = await connecter(depsPartage);

      const definition = RESSOURCES_DOSSIER.find((d) => d.suffixe === "journaux")!;
      const original = definition.service;
      (definition as { service: unknown }).service = (async (_deps, ctx) => ({
        dossier: ctx.dossier.id,
        resultats: [{ id: "j-1", code: "AC", nom: "Achats", type: "achats", type_source: "Achats", compte_contrepartie: null }],
        bruts: null,
        pagination: { renvoyes: 1, total: 1, total_source: 1, hasMore: false, curseur: null },
        completude: "complete",
        raison_arret: null,
        approximatif: false,
        avertissements: ["Valeur source suspecte : contact@exemple.fr"],
        sources: ["hubbix-compta:/journals"],
        appels_source: 1,
        tentatives: 1,
      })) as ServiceOutil;
      try {
        const lecture = await client.readResource({ uri: "ebp://cpt-demo/journaux" });
        const texte = (lecture.contents[0] as { text: string }).text;
        expect(texte).not.toContain("contact@exemple.fr");
        expect(texte).toContain("[masqué]");
      } finally {
        (definition as { service: unknown }).service = original;
      }
    },
  );
});
