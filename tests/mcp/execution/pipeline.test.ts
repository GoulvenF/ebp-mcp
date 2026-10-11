import { describe, expect, it } from "vitest";
import {
  BUDGET_TENTATIVES_OUTIL,
  DEADLINE_OUTIL_MS,
  executerOutilMetier,
  executerServiceDossier,
  ResultatExercicesSchema,
  REGISTRE_SERVICES,
} from "../../../dist/index.js";
import type { ExecutionContext, ResultatService, ServiceOutil } from "../../../dist/index.js";
import {
  creerConfigTest,
  creerDepsProcessusTest,
  creerSessionMcpTest,
  DOSSIER_CPT,
  DOSSIER_GC,
} from "../fixtures.js";

/** Résultat de service minimal valide, pour les doubles capturant l'`ExecutionContext` reçu. */
function resultatServiceVide(dossier: string): ResultatService<unknown> {
  return {
    dossier,
    resultats: [],
    bruts: null,
    pagination: null,
    completude: "complete",
    raison_arret: null,
    approximatif: false,
    avertissements: [],
    sources: [],
    appels_source: 0,
    tentatives: 0,
  };
}

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

  it("budget et deadline : l'ExecutionContext reçu par le service porte budgetRestant === 30 et deadline === réception + 60 000 ms", async () => {
    const deps = creerDepsProcessusTest([]);
    const session = creerSessionMcpTest(deps.config);
    let contexteRecu: ExecutionContext | undefined;
    const original = REGISTRE_SERVICES.exercices;
    REGISTRE_SERVICES.exercices = (async (_depsService, ctx, _entree) => {
      contexteRecu = ctx.execution;
      return resultatServiceVide(ctx.dossier.id);
    }) as ServiceOutil;
    try {
      const avant = deps.clock.now().getTime();
      const reponse = await executerOutilMetier(deps, session, "exercices", { dossier: DOSSIER_CPT.alias }, OPTIONS_MOCK);
      expect(reponse.isError).toBe(false);
      expect(contexteRecu?.budgetRestant).toBe(BUDGET_TENTATIVES_OUTIL);
      expect(contexteRecu?.deadline.getTime()).toBe(avant + DEADLINE_OUTIL_MS);
    } finally {
      REGISTRE_SERVICES.exercices = original;
    }
  });

  it("une ressource de dossier consomme le même budget et la même deadline qu'un outil, via l'aide commune `executerServiceDossier` (D-T12-3, T12-4)", async () => {
    const deps = creerDepsProcessusTest([]);
    let contexteOutil: ExecutionContext | undefined;
    const original = REGISTRE_SERVICES.exercices;
    REGISTRE_SERVICES.exercices = (async (_depsService, ctx, _entree) => {
      contexteOutil = ctx.execution;
      return resultatServiceVide(ctx.dossier.id);
    }) as ServiceOutil;
    try {
      const session = creerSessionMcpTest(deps.config);
      const avantOutil = deps.clock.now().getTime();
      const reponseOutil = await executerOutilMetier(deps, session, "exercices", { dossier: DOSSIER_CPT.alias }, OPTIONS_MOCK);
      expect(reponseOutil.isError).toBe(false);

      let contexteRessource: ExecutionContext | undefined;
      const serviceRessource: ServiceOutil = async (_depsService, ctx, _entree) => {
        contexteRessource = ctx.execution;
        return resultatServiceVide(ctx.dossier.id);
      };
      const avantRessource = deps.clock.now().getTime();
      await executerServiceDossier(
        deps,
        OPTIONS_MOCK,
        deps.clock.now(),
        DOSSIER_CPT,
        serviceRessource,
        {},
        ResultatExercicesSchema,
        "ebp://{dossier}/exercices",
      );

      expect(contexteOutil?.budgetRestant).toBe(BUDGET_TENTATIVES_OUTIL);
      expect(contexteRessource?.budgetRestant).toBe(BUDGET_TENTATIVES_OUTIL);
      expect(contexteOutil?.deadline.getTime()).toBe(avantOutil + DEADLINE_OUTIL_MS);
      expect(contexteRessource?.deadline.getTime()).toBe(avantRessource + DEADLINE_OUTIL_MS);
    } finally {
      REGISTRE_SERVICES.exercices = original;
    }
  });

  it("observe_a et duree_ms suivent l'horloge injectée, avancée pendant le service", async () => {
    const deps = creerDepsProcessusTest([]);
    const session = creerSessionMcpTest(deps.config);
    const original = REGISTRE_SERVICES.exercices;
    REGISTRE_SERVICES.exercices = (async (_depsService, ctx, _entree) => {
      deps.clock.avancer(5_000);
      return resultatServiceVide(ctx.dossier.id);
    }) as ServiceOutil;
    try {
      const avant = deps.clock.now();
      const reponse = await executerOutilMetier(deps, session, "exercices", { dossier: DOSSIER_CPT.alias }, OPTIONS_MOCK);
      expect(reponse.isError).toBe(false);
      const meta = (reponse as { structuredContent: { meta: { duree_ms: number; observe_a: string } } }).structuredContent
        .meta;
      expect(meta.duree_ms).toBe(5_000);
      expect(meta.observe_a).toBe(new Date(avant.getTime() + 5_000).toISOString());
    } finally {
      REGISTRE_SERVICES.exercices = original;
    }
  });

  it("un signal déjà annulé arrête l'appel sans succès, avec son code et 0 appel transport", async () => {
    const deps = creerDepsProcessusTest([{ status: 200, corps: { exercices: [] } }]);
    const session = creerSessionMcpTest(deps.config);
    const controleur = new AbortController();
    controleur.abort();
    const options = { ...OPTIONS_MOCK, signal: controleur.signal };
    const reponse = await executerOutilMetier(deps, session, "exercices", { dossier: DOSSIER_CPT.alias }, options);
    expect(reponse.isError).toBe(true);
    const corps = JSON.parse(reponse.content[0].text) as { erreur: { code: string } };
    expect(corps.erreur.code).toBe("RESOLUTION_INCOMPLETE");
    expect(deps.transport.appels).toHaveLength(0);
  });

  it("appels_auth === 1 avec un hook token qui consomme une tentative, et appels_api + appels_auth === tentatives décomptées à la main", async () => {
    const deps = creerDepsProcessusTest([{ status: 200, corps: { exercices: [] } }]);
    // Génération initiale du hook factice = 1 (`creerHookTokenFactice({ generation: 1, ... })`) :
    // l'invalider force le prochain `obtenirToken` à rafraîchir, donc `tentativesAuth: 1`.
    await deps.hookToken.invaliderToken(1);
    const session = creerSessionMcpTest(deps.config);
    const reponse = await executerOutilMetier(deps, session, "exercices", { dossier: DOSSIER_CPT.alias }, OPTIONS_MOCK);
    expect(reponse.isError).toBe(false);
    const enveloppe = (reponse as { structuredContent: { meta: { appels_api: number; appels_auth: number } } })
      .structuredContent;
    // Décompte à la main : 1 départ de transport (une seule réponse 200 programmée) + 1 tentative
    // auth consommée par le rafraîchissement forcé ci-dessus = 2.
    expect(enveloppe.meta.appels_auth).toBe(1);
    expect(enveloppe.meta.appels_api).toBe(1);
    expect(enveloppe.meta.appels_api + enveloppe.meta.appels_auth).toBe(2);
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

describe("executerOutilMetier — PII de bout en bout (D-T12-8)", () => {
  const OPTIONS_PII = { mode: "mock" as const, politique: { redactPii: true } };

  it("transactions_bancaires en mode PII : compte_bancaire à null, avertissement unique aux chemins généralisés, servi par le cache au second appel : masqué aussi, appels_api à 0", async () => {
    const deps = creerDepsProcessusTest([
      { status: 200, corps: { data: [transactionBrute()], take: 50, skip: 0, totalRecords: 1 } },
    ]);
    const session = creerSessionMcpTest(deps.config);
    const args = { dossier: DOSSIER_CPT.alias, du: "2026-03-01", au: "2026-03-31" };

    const premier = await executerOutilMetier(deps, session, "transactions_bancaires", args, OPTIONS_PII);
    expect(premier.isError).toBe(false);
    const enveloppe1 = (premier as {
      structuredContent: { resultats: { compte_bancaire: string | null }[]; meta: { appels_api: number; avertissements: string[] } };
    }).structuredContent;
    expect(enveloppe1.resultats[0]?.compte_bancaire).toBeNull();
    expect(enveloppe1.meta.appels_api).toBe(1);
    expect(enveloppe1.meta.avertissements).toHaveLength(1);
    expect(enveloppe1.meta.avertissements[0]).toContain("resultats[].compte_bancaire");

    const second = await executerOutilMetier(deps, session, "transactions_bancaires", args, OPTIONS_PII);
    expect(second.isError).toBe(false);
    const enveloppe2 = (second as {
      structuredContent: { resultats: { compte_bancaire: string | null }[]; meta: { appels_api: number; avertissements: string[] } };
    }).structuredContent;
    expect(enveloppe2.resultats[0]?.compte_bancaire).toBeNull();
    expect(enveloppe2.meta.appels_api).toBe(0);
    expect(enveloppe2.meta.avertissements).toHaveLength(1);
  });

  it("hors mode PII, la même réponse n'est pas masquée", async () => {
    const deps = creerDepsProcessusTest([
      { status: 200, corps: { data: [transactionBrute()], take: 50, skip: 0, totalRecords: 1 } },
    ]);
    const session = creerSessionMcpTest(deps.config);
    const args = { dossier: DOSSIER_CPT.alias, du: "2026-03-01", au: "2026-03-31" };
    const reponse = await executerOutilMetier(deps, session, "transactions_bancaires", args, OPTIONS_MOCK);
    expect(reponse.isError).toBe(false);
    const enveloppe = (reponse as { structuredContent: { resultats: { compte_bancaire: string | null }[] } })
      .structuredContent;
    expect(enveloppe.resultats[0]?.compte_bancaire).toBe("FR7630006000011234567890189");
  });

  it("une erreur de service portant un IBAN, un email et un téléphone (cas transactions_bancaires.compte invalide côté EBP) est masquée dans le message, l'action et les details", async () => {
    const deps = creerDepsProcessusTest([]);
    const session = creerSessionMcpTest(deps.config);
    const iban = "FR7630006000011234567890189";

    class ErreurServiceTest extends Error {
      readonly erreur: { code: string; message: string; action: string; details?: Record<string, unknown> };
      constructor(erreur: { code: string; message: string; action: string; details?: Record<string, unknown> }) {
        super(erreur.message);
        this.erreur = erreur;
      }
    }

    const original = REGISTRE_SERVICES.transactions_bancaires;
    REGISTRE_SERVICES.transactions_bancaires = (async () => {
      throw new ErreurServiceTest({
        code: "INVALID_ARGUMENT",
        message: `Compte ${iban} invalide pour contact@exemple.fr au 0601020304.`,
        action: `Corriger la valeur ${iban}.`,
        details: { champ: iban },
      });
    }) as ServiceOutil;
    try {
      const args = { dossier: DOSSIER_CPT.alias, du: "2026-03-01", au: "2026-03-31", compte: iban };
      const reponse = await executerOutilMetier(deps, session, "transactions_bancaires", args, OPTIONS_PII);
      expect(reponse.isError).toBe(true);
      const corps = JSON.parse(reponse.content[0].text) as {
        erreur: { code: string; message: string; action: string; details?: Record<string, unknown> };
      };
      expect(corps.erreur.code).toBe("INVALID_ARGUMENT");
      expect(corps.erreur.message).not.toContain(iban);
      expect(corps.erreur.message).not.toContain("contact@exemple.fr");
      expect(corps.erreur.message).not.toContain("0601020304");
      expect(corps.erreur.message).toContain("[masqué]");
      expect(corps.erreur.action).not.toContain(iban);
      expect(corps.erreur.details?.champ).toBe("[masqué]");
      expect(deps.transport.appels).toHaveLength(0);
    } finally {
      REGISTRE_SERVICES.transactions_bancaires = original;
    }
  });
});
