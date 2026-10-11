import { describe, expect, it } from "vitest";
import { executerOutilMetier } from "../../../dist/index.js";
import {
  creerConfigTest,
  creerDepsProcessusTest,
  creerSessionMcpTest,
  DOSSIER_CPT,
  DOSSIER_GC,
} from "../fixtures.js";

const OPTIONS_MOCK = { mode: "mock" as const, politique: { redactPii: false } };

describe("executerOutilMetier — pipeline D-T12-3", () => {
  it("entrée inconnue (clé non déclarée) : INVALID_ARGUMENT, 0 appel transport", async () => {
    const deps = creerDepsProcessusTest([]);
    const session = creerSessionMcpTest(deps.config);
    const reponse = await executerOutilMetier(deps, session, "exercices", { champInconnu: true }, OPTIONS_MOCK);
    expect(reponse.isError).toBe(true);
    const corps = JSON.parse(reponse.content[0].text) as { erreur: { code: string } };
    expect(corps.erreur.code).toBe("INVALID_ARGUMENT");
    expect(deps.transport.appels).toHaveLength(0);
  });

  it("entrée invalide (limite hors plage) : INVALID_ARGUMENT, 0 appel transport", async () => {
    const deps = creerDepsProcessusTest([]);
    const session = creerSessionMcpTest(deps.config);
    const reponse = await executerOutilMetier(
      deps,
      session,
      "rechercher_tiers",
      { dossier: DOSSIER_CPT.alias, limite: 0 },
      OPTIONS_MOCK,
    );
    expect(reponse.isError).toBe(true);
    const corps = JSON.parse(reponse.content[0].text) as { erreur: { code: string } };
    expect(corps.erreur.code).toBe("INVALID_ARGUMENT");
    expect(deps.transport.appels).toHaveLength(0);
  });

  it("`inclure_brut: true` en mode PII : PII_POLICY, 0 appel, avant tout cache ou réseau", async () => {
    const deps = creerDepsProcessusTest([]);
    const session = creerSessionMcpTest(deps.config);
    const options = { mode: "mock" as const, politique: { redactPii: true } };
    const reponse = await executerOutilMetier(
      deps,
      session,
      "exercices",
      { dossier: DOSSIER_CPT.alias, inclure_brut: true },
      options,
    );
    expect(reponse.isError).toBe(true);
    const corps = JSON.parse(reponse.content[0].text) as { erreur: { code: string } };
    expect(corps.erreur.code).toBe("PII_POLICY");
    expect(deps.transport.appels).toHaveLength(0);
  });

  it("pas de dossier (argument absent, session vide, pas de défaut configuré) : DOSSIER_REQUIRED, même avec un seul dossier configuré", async () => {
    const config = creerConfigTest({ dossiers: { prod: [DOSSIER_CPT], preprod: [] } });
    const deps = creerDepsProcessusTest([], { config });
    const session = creerSessionMcpTest(deps.config);
    const reponse = await executerOutilMetier(deps, session, "exercices", {}, OPTIONS_MOCK);
    expect(reponse.isError).toBe(true);
    const corps = JSON.parse(reponse.content[0].text) as { erreur: { code: string } };
    expect(corps.erreur.code).toBe("DOSSIER_REQUIRED");
    expect(deps.transport.appels).toHaveLength(0);
  });

  it("alias de dossier inconnu : DOSSIER_UNKNOWN, 0 appel", async () => {
    const deps = creerDepsProcessusTest([]);
    const session = creerSessionMcpTest(deps.config);
    const reponse = await executerOutilMetier(deps, session, "exercices", { dossier: "alias-absent" }, OPTIONS_MOCK);
    expect(reponse.isError).toBe(true);
    const corps = JSON.parse(reponse.content[0].text) as { erreur: { code: string } };
    expect(corps.erreur.code).toBe("DOSSIER_UNKNOWN");
    expect(deps.transport.appels).toHaveLength(0);
  });

  it("outil CPT (`exercices`) sur un dossier GC : UNSUPPORTED_CAPABILITY, 0 appel", async () => {
    const deps = creerDepsProcessusTest([]);
    const session = creerSessionMcpTest(deps.config);
    const reponse = await executerOutilMetier(deps, session, "exercices", { dossier: DOSSIER_GC.alias }, OPTIONS_MOCK);
    expect(reponse.isError).toBe(true);
    const corps = JSON.parse(reponse.content[0].text) as { erreur: { code: string } };
    expect(corps.erreur.code).toBe("UNSUPPORTED_CAPABILITY");
    expect(deps.transport.appels).toHaveLength(0);
  });

  it("famille non active sur le profil : refus, 0 appel", async () => {
    const config = creerConfigTest({ famillesActives: ["hubbix-gescom"] });
    const deps = creerDepsProcessusTest([], { config });
    const session = creerSessionMcpTest(deps.config);
    const reponse = await executerOutilMetier(deps, session, "exercices", { dossier: DOSSIER_CPT.alias }, OPTIONS_MOCK);
    expect(reponse.isError).toBe(true);
    const corps = JSON.parse(reponse.content[0].text) as { erreur: { code: string } };
    expect(corps.erreur.code).toBe("UNSUPPORTED_CAPABILITY");
    expect(deps.transport.appels).toHaveLength(0);
  });

  it("l'argument `dossier` prime sur le dossier actif de la session, qui prime sur le défaut", async () => {
    const config = creerConfigTest({ aliasDefaut: DOSSIER_GC.alias });
    const deps = creerDepsProcessusTest(
      [{ status: 200, corps: { exercices: [] } }],
      { config },
    );
    const session = creerSessionMcpTest(deps.config);
    session.session.choisir(DOSSIER_GC.alias);
    const reponse = await executerOutilMetier(deps, session, "exercices", { dossier: DOSSIER_CPT.alias }, OPTIONS_MOCK);
    expect(reponse.isError).toBe(false);
    const structure = (reponse as { structuredContent: { dossier: string } }).structuredContent;
    expect(structure.dossier).toBe(DOSSIER_CPT.id);
  });

  it("budget et deadline : le contexte porte bien 30 tentatives et 60 s depuis la réception", async () => {
    const deps = creerDepsProcessusTest([{ status: 200, corps: { exercices: [] } }]);
    const session = creerSessionMcpTest(deps.config);
    const avant = deps.clock.now().getTime();
    const reponse = await executerOutilMetier(deps, session, "exercices", { dossier: DOSSIER_CPT.alias }, OPTIONS_MOCK);
    expect(reponse.isError).toBe(false);
    const meta = (reponse as { structuredContent: { meta: { duree_ms: number } } }).structuredContent.meta;
    expect(meta.duree_ms).toBe(deps.clock.now().getTime() - avant);
  });

  it("un signal déjà annulé arrête l'appel sans succès", async () => {
    const deps = creerDepsProcessusTest([{ status: 200, corps: { exercices: [] } }]);
    const session = creerSessionMcpTest(deps.config);
    const controleur = new AbortController();
    controleur.abort();
    const options = { ...OPTIONS_MOCK, signal: controleur.signal };
    const reponse = await executerOutilMetier(deps, session, "exercices", { dossier: DOSSIER_CPT.alias }, options);
    expect(reponse.isError).toBe(true);
  });

  it("appels_api + appels_auth === tentatives, avec un hook token qui consomme une tentative auth", async () => {
    const deps = creerDepsProcessusTest([{ status: 200, corps: { exercices: [] } }]);
    deps.hookToken.simulerRefreshConcurrent();
    const session = creerSessionMcpTest(deps.config);
    const reponse = await executerOutilMetier(deps, session, "exercices", { dossier: DOSSIER_CPT.alias }, OPTIONS_MOCK);
    expect(reponse.isError).toBe(false);
    const enveloppe = (reponse as { structuredContent: { meta: { appels_api: number; appels_auth: number } } })
      .structuredContent;
    expect(enveloppe.meta.appels_api + enveloppe.meta.appels_auth).toBeGreaterThan(0);
  });

  it("mode reflète l'option passée au serveur", async () => {
    const deps = creerDepsProcessusTest([{ status: 200, corps: { exercices: [] } }]);
    const session = creerSessionMcpTest(deps.config);
    const options = { mode: "live" as const, politique: { redactPii: false } };
    const reponse = await executerOutilMetier(deps, session, "exercices", { dossier: DOSSIER_CPT.alias }, options);
    const enveloppe = (reponse as { structuredContent: { meta: { mode: string } } }).structuredContent;
    expect(enveloppe.meta.mode).toBe("live");
  });

  it("quota_* reflète getStatut du groupe ciblé", async () => {
    const deps = creerDepsProcessusTest([{ status: 200, corps: { exercices: [] } }]);
    const session = creerSessionMcpTest(deps.config);
    const reponse = await executerOutilMetier(deps, session, "exercices", { dossier: DOSSIER_CPT.alias }, OPTIONS_MOCK);
    const enveloppe = (reponse as {
      structuredContent: { meta: { quota_jour_restant: number; quota_utilisable: number; quota_estime: boolean } };
    }).structuredContent;
    expect(enveloppe.meta.quota_jour_restant).toBe(10_000);
    expect(enveloppe.meta.quota_utilisable).toBe(9_500);
    expect(enveloppe.meta.quota_estime).toBe(true);
  });

  it("deuxième appel identique servi par le cache : appels_api à 0", async () => {
    const deps = creerDepsProcessusTest([
      {
        status: 200,
        corps: {
          data: [
            {
              uuid: "11111111-1111-1111-1111-111111111111",
              name: "Client Un",
              number: "411000",
              vatNumber: null,
              siret: null,
              isActive: true,
              types: null,
            },
          ],
          totalRecords: 1,
        },
      },
    ]);
    const session = creerSessionMcpTest(deps.config);
    const args = { dossier: DOSSIER_CPT.alias };

    const premier = await executerOutilMetier(deps, session, "rechercher_tiers", args, OPTIONS_MOCK);
    expect(premier.isError).toBe(false);
    const meta1 = (premier as { structuredContent: { meta: { appels_api: number } } }).structuredContent.meta;
    expect(meta1.appels_api).toBe(1);

    const second = await executerOutilMetier(deps, session, "rechercher_tiers", args, OPTIONS_MOCK);
    expect(second.isError).toBe(false);
    const meta2 = (second as { structuredContent: { meta: { appels_api: number } } }).structuredContent.meta;
    expect(meta2.appels_api).toBe(0);
  });
});
