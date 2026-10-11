// Critère d'acceptation restant (GOU-371, T13-1) : test d'intégration bout-en-bout en mode mock —
// un vrai client SDK (`@modelcontextprotocol/sdk`), connecté par `InMemoryTransport` à un serveur
// construit sur la pile mock RÉELLE (`construirePileMock` : config résolue, stockage fichier,
// verrous, quota, hook token, login T06 complet), exerce les 17 outils v0.1 et les ressources de
// démo, avec des assertions calculées à la main depuis `src/mock/donnees/{cpt,gc}.ts` (jamais
// recopiées d'une sortie exécutée).
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  creerFabriqueServeur,
  DATE_REFERENCE_DEMO,
  JEU_CPT_DEMO,
  JEU_GC_DEMO,
  UUID_ECRITURE_DEMO,
} from "../../dist/index.js";
import type { JeuMock } from "../../dist/index.js";
import { portLibre } from "../auth/fixtures.js";
import {
  construirePileMock,
  creerHorlogeControlee,
  creerRepertoireTemporaireMock,
  nettoyerRepertoireMock,
  type PileMock,
} from "./fixtures.js";

const JEU: JeuMock = { cpt: JEU_CPT_DEMO, gc: JEU_GC_DEMO };

/** Alias des deux dossiers démo (`examples/config.demo.json`/`PROFIL_DEMO`, D-T13-5). */
const DOSSIER_CPT = "demo-cpt";
const DOSSIER_GC = "demo-gc";

/**
 * UUID du tiers « Client Démo Un » (`TIERS_1`, `src/mock/donnees/cpt.ts`) : lu directement dans le
 * jeu exporté, jamais recopié d'une sortie exécutée.
 */
const UUID_TIERS_1 = (
  JEU_CPT_DEMO.details["cpt-auxiliary-account-detail"] as Readonly<Record<string, { readonly uuid: string }>>
)["4010001"]!.uuid;

interface ContexteClient {
  readonly racine: string;
  readonly pile: PileMock;
  readonly client: Client;
}

async function demarrerClient(): Promise<ContexteClient> {
  const racine = await creerRepertoireTemporaireMock();
  const port = await portLibre();
  const clock = creerHorlogeControlee(DATE_REFERENCE_DEMO);
  const pile = await construirePileMock(racine, clock, JEU, `http://127.0.0.1:${port}/callback`);
  // Login T06 complet (consentement simulé) : seul moyen d'obtenir un token valide dans le store
  // réel que `creerHookToken` lira à chaque appel d'outil.
  await pile.connecter();

  const fabrique = creerFabriqueServeur(pile.depsPartage, { mode: "mock" });
  const serveur = fabrique();
  const [transportServeur, transportClient] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-integration-mock", version: "0.0.0" });
  await Promise.all([serveur.connect(transportServeur), client.connect(transportClient)]);
  await client.listTools();

  return { racine, pile, client };
}

let contexte: ContexteClient;

beforeEach(async () => {
  contexte = await demarrerClient();
});

afterEach(async () => {
  await nettoyerRepertoireMock(contexte.racine);
});

function metaDe(reponse: Awaited<ReturnType<Client["callTool"]>>): { readonly mode: string } {
  return (reponse.structuredContent as { meta: { mode: string } }).meta;
}

/** Un appel valide par outil, choisi dans le jeu de démo (D-T13-1), couvrant les 17 outils v0.1. */
const APPELS_OUTILS: ReadonlyArray<{ readonly nom: string; readonly args: Record<string, unknown> }> = [
  { nom: "ebp_lister_dossiers", args: {} },
  { nom: "ebp_choisir_dossier", args: { dossier: DOSSIER_CPT } },
  { nom: "ebp_statut", args: {} },
  { nom: "rechercher_tiers", args: { dossier: DOSSIER_CPT } },
  { nom: "fiche_tiers", args: { dossier: DOSSIER_CPT, id: UUID_TIERS_1 } },
  { nom: "rechercher_articles", args: { dossier: DOSSIER_GC } },
  { nom: "fiche_article", args: { dossier: DOSSIER_GC, code: "ART0001" } },
  { nom: "lister_documents_vente", args: { dossier: DOSSIER_GC } },
  { nom: "detail_document", args: { dossier: DOSSIER_GC, numero: "F2026-010" } },
  { nom: "echeancier_clients", args: { dossier: DOSSIER_GC } },
  { nom: "lister_reglements", args: { dossier: DOSSIER_GC } },
  { nom: "lister_ecritures", args: { dossier: DOSSIER_CPT } },
  { nom: "detail_ecriture", args: { dossier: DOSSIER_CPT, id: UUID_ECRITURE_DEMO } },
  { nom: "transactions_bancaires", args: { dossier: DOSSIER_CPT, du: "2026-03-01", au: "2026-03-31" } },
  { nom: "balance_comptes", args: { dossier: DOSSIER_CPT, du: "2026-03-01", au: "2026-03-31" } },
  { nom: "grand_livre", args: { dossier: DOSSIER_CPT, compte: "411000", du: "2026-03-01", au: "2026-03-31" } },
  { nom: "exercices", args: { dossier: DOSSIER_CPT } },
];

describe("17 outils MCP v0.1 via un client SDK réel, mode mock (GOU-371)", () => {
  it("couvre exactement les 17 outils listés par `tools/list`", async () => {
    const { tools } = await contexte.client.listTools();
    expect(tools).toHaveLength(17);
    expect(tools.map((t) => t.name).sort()).toEqual(APPELS_OUTILS.map((a) => a.nom).sort());
  });

  it.each(APPELS_OUTILS)("`$nom` réussit en mode mock", async ({ nom, args }) => {
    const reponse = await contexte.client.callTool({ name: nom, arguments: args });
    expect(reponse.isError).toBeFalsy();
    expect(metaDe(reponse).mode).toBe("mock");
  });
});

describe("ressources de démo via un client SDK réel, mode mock (GOU-371)", () => {
  it("`resources/list` et `resources/templates/list` répondent sans erreur", async () => {
    const { resources } = await contexte.client.listResources();
    const uris = resources.map((r) => r.uri);
    expect(uris).toEqual(
      expect.arrayContaining([
        "ebp://dossiers",
        "ebp://glossaire",
        `ebp://${DOSSIER_CPT}/exercices`,
        `ebp://${DOSSIER_CPT}/journaux`,
        `ebp://${DOSSIER_CPT}/plan-comptable`,
        `ebp://${DOSSIER_CPT}/taux-tva`,
        `ebp://${DOSSIER_GC}/taux-tva`,
      ]),
    );
    const { resourceTemplates } = await contexte.client.listResourceTemplates();
    expect(resourceTemplates).toHaveLength(4);
  });

  it.each([
    "ebp://dossiers",
    "ebp://glossaire",
    `ebp://${DOSSIER_CPT}/exercices`,
    `ebp://${DOSSIER_CPT}/journaux`,
    `ebp://${DOSSIER_CPT}/plan-comptable`,
    `ebp://${DOSSIER_CPT}/taux-tva`,
    `ebp://${DOSSIER_GC}/taux-tva`,
  ])("`resources/read` sur `%s` réussit", async (uri) => {
    const lecture = await contexte.client.readResource({ uri });
    expect(lecture.contents).toHaveLength(1);
    expect(() => JSON.parse((lecture.contents[0] as { text: string }).text)).not.toThrow();
  });
});

describe("valeurs calculées à la main depuis le jeu de démo (GOU-371)", () => {
  it(
    "`balance_comptes` sur 411000 en mars 2026 : débit 150, crédit 40, solde 110 " +
      "(100 + 50 débit des deux factures, 40 crédit du règlement — `LIGNE_HORS_FENETRE` de février " +
      "et `LIGNE_ACHAT` sur 607000 sont hors périmètre ; `decimalAdd`/`decimalSubtract` ne " +
      "réintroduisent jamais les zéros décimaux de la source)",
    async () => {
      const reponse = await contexte.client.callTool({
        name: "balance_comptes",
        arguments: { dossier: DOSSIER_CPT, du: "2026-03-01", au: "2026-03-31", comptes: ["411000"] },
      });
      expect(reponse.isError).toBeFalsy();
      const comptes = (
        reponse.structuredContent as {
          resultats: { comptes: { compte: string; debit: string; credit: string; solde: string }[] }[];
        }
      ).resultats[0]!.comptes;
      expect(comptes).toHaveLength(1);
      expect(comptes[0]).toMatchObject({ compte: "411000", debit: "150", credit: "40", solde: "110" });
    },
  );

  it(
    "`echeancier_clients` à `DATE_REFERENCE_DEMO` (2026-03-15) : 2 échéances au total, 1 seule en " +
      "retard (`ECHEANCE_EN_RETARD` du 2026-02-01, reste dû 100.00 > 0, 42 jours de retard ; " +
      "`ECHEANCE_A_VENIR` du 2026-04-01 n'est jamais en retard)",
    async () => {
      const reponse = await contexte.client.callTool({
        name: "echeancier_clients",
        arguments: { dossier: DOSSIER_GC },
      });
      expect(reponse.isError).toBeFalsy();
      const resultats = (
        reponse.structuredContent as {
          resultats: { id: string; en_retard: boolean | null; jours_retard: number | null }[];
        }
      ).resultats;
      expect(resultats).toHaveLength(2);
      const enRetard = resultats.find((e) => e.id === "ech-1")!;
      expect(enRetard.en_retard).toBe(true);
      expect(enRetard.jours_retard).toBe(42);
      const aVenir = resultats.find((e) => e.id === "ech-2")!;
      expect(aVenir.en_retard).toBe(false);
      expect(aVenir.jours_retard).toBe(0);
    },
  );

  it(
    "`rechercher_articles` (55 articles synthétiques, limite par défaut 50) tient sur exactement " +
      "2 pages : 50 éléments puis 5, `hasMore` passant de `true` à `false`",
    async () => {
      const premierePage = await contexte.client.callTool({
        name: "rechercher_articles",
        arguments: { dossier: DOSSIER_GC },
      });
      expect(premierePage.isError).toBeFalsy();
      const contenuPage1 = premierePage.structuredContent as {
        resultats: unknown[];
        pagination: { curseur: string | null; hasMore: boolean };
      };
      expect(contenuPage1.resultats).toHaveLength(50);
      expect(contenuPage1.pagination.hasMore).toBe(true);
      expect(contenuPage1.pagination.curseur).not.toBeNull();

      const secondePage = await contexte.client.callTool({
        name: "rechercher_articles",
        arguments: { dossier: DOSSIER_GC, curseur: contenuPage1.pagination.curseur! },
      });
      expect(secondePage.isError).toBeFalsy();
      const contenuPage2 = secondePage.structuredContent as {
        resultats: unknown[];
        pagination: { curseur: string | null; hasMore: boolean };
      };
      expect(contenuPage2.resultats).toHaveLength(5);
      expect(contenuPage2.pagination.hasMore).toBe(false);
    },
  );

  it(
    "`fiche_tiers` par `id` UUID retrouve exactement « Client Démo Un » (`TIERS_1`, compte 4010001)",
    async () => {
      const reponse = await contexte.client.callTool({
        name: "fiche_tiers",
        arguments: { dossier: DOSSIER_CPT, id: UUID_TIERS_1 },
      });
      expect(reponse.isError).toBeFalsy();
      const resultat = (reponse.structuredContent as { resultats: { id: string; compte: string; nom: string }[] })
        .resultats[0]!;
      expect(resultat).toMatchObject({ id: UUID_TIERS_1, compte: "4010001", nom: "Client Démo Un" });
    },
  );
});
