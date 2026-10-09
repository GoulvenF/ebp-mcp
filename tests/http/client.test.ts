import { describe, expect, it, vi } from "vitest";
import {
  executerRequete,
  executerRequetePourRoute,
  trouverRoute,
} from "../../dist/index.js";
import type { ContexteHttp, DependancesClientHttp, EntreeRegistre } from "../../dist/index.js";
import {
  creerHookTokenFactice,
  creerHookTokenInterdit,
  creerHorlogeControlee,
  creerQuotaFactice,
  creerTransportFactice,
  creerTransportJamaisResolu,
  instrumenterHorloge,
} from "./fixtures.js";

const DEPART = new Date("2026-01-01T00:00:00.000Z");
const ROUTE_SANS_PARAMS = trouverRoute("cpt-vat-rate") as EntreeRegistre;

function contexte(groupeQuota = "groupe-test"): ContexteHttp {
  return {
    environnement: "prod",
    famille: "hubbix-compta",
    dossierId: "dossier-test",
    subscriptionKey: null,
    groupeQuota,
  };
}

function budgetDe(restant: number, deadlineMs: number, signal?: AbortSignal) {
  const budget = {
    restant,
    deadline: new Date(DEPART.getTime() + deadlineMs),
    ...(signal !== undefined ? { signal } : {}),
    consommer(n: number): void {
      budget.restant -= n;
    },
  };
  return budget;
}

describe("client.ts — critère #1 : POST métier et maintenance refusés", () => {
  it("route forgée en POST : refusée avant tout accès au hook token ou au transport", async () => {
    const transport = creerTransportFactice([]);
    const clock = creerHorlogeControlee(DEPART);
    const deps: DependancesClientHttp = {
      transport,
      clock,
      quota: creerQuotaFactice(clock),
      hookToken: creerHookTokenInterdit(),
    };
    const routePost: EntreeRegistre = { ...ROUTE_SANS_PARAMS, methode: "POST" as "GET" };
    await expect(
      executerRequete(deps, budgetDe(30, 60_000), contexte(), routePost),
    ).rejects.toMatchObject({ erreur: { code: "INVALID_ARGUMENT" } });
    expect(transport.appels).toHaveLength(0);
  });

  it("chemin de maintenance non déclaré : refusé avant tout accès au hook token ou au transport", async () => {
    const transport = creerTransportFactice([]);
    const clock = creerHorlogeControlee(DEPART);
    const deps: DependancesClientHttp = {
      transport,
      clock,
      quota: creerQuotaFactice(clock),
      hookToken: creerHookTokenInterdit(),
    };
    await expect(
      executerRequetePourRoute(deps, budgetDe(30, 60_000), contexte(), "maintenance-unlogall"),
    ).rejects.toMatchObject({ erreur: { code: "INVALID_ARGUMENT" } });
    expect(transport.appels).toHaveLength(0);
  });
});

describe("client.ts — critère #2 (volet client) : hôte étranger refusé", () => {
  it("route forgée avec un hôte hors du libellé 'metier' : refusée avant toute émission", async () => {
    const transport = creerTransportFactice([]);
    const clock = creerHorlogeControlee(DEPART);
    const deps: DependancesClientHttp = {
      transport,
      clock,
      quota: creerQuotaFactice(clock),
      hookToken: creerHookTokenInterdit(),
    };
    const routeEtrangere: EntreeRegistre = { ...ROUTE_SANS_PARAMS, hote: "etranger" as "metier" };
    await expect(
      executerRequete(deps, budgetDe(30, 60_000), contexte(), routeEtrangere),
    ).rejects.toMatchObject({ erreur: { code: "INVALID_ARGUMENT" } });
    expect(transport.appels).toHaveLength(0);
  });
});

describe("client.ts — critère #4 : 401 un seul rejeu", () => {
  it("401 puis succès après invalidation ciblée : un seul rejeu, deux émissions", async () => {
    const transport = creerTransportFactice([
      { status: 401, corps: { status: 401, errorCode: "Auth.InvalidToken" } },
      { status: 200, corps: { ok: true } },
    ]);
    const clock = creerHorlogeControlee(DEPART);
    const hook = creerHookTokenFactice({ accessToken: "acc-1", generation: 1 });
    const deps: DependancesClientHttp = { transport, clock, quota: creerQuotaFactice(clock), hookToken: hook };

    const resultat = await executerRequete(deps, budgetDe(30, 60_000), contexte(), ROUTE_SANS_PARAMS);
    expect(resultat).toEqual({ ok: true });
    expect(transport.appels).toHaveLength(2);
    expect(hook.appelsInvalider).toEqual([1]);
  });

  it("génération déjà avancée entre-temps : reprise sans invalidation effective, pas de second échange forcé", async () => {
    const transport = creerTransportFactice([
      { status: 401, corps: { status: 401, errorCode: "Auth.InvalidToken" } },
      { status: 200, corps: { ok: true } },
    ]);
    const clock = creerHorlogeControlee(DEPART);
    const hook = creerHookTokenFactice({ accessToken: "acc-1", generation: 1 });
    // Un autre appel a déjà fait avancer la génération avant l'invalidation de celui-ci.
    const invaliderOriginal = hook.invaliderToken.bind(hook);
    let appelsEffectues = 0;
    hook.invaliderToken = async (generation: number) => {
      appelsEffectues += 1;
      hook.simulerRefreshConcurrent();
      await invaliderOriginal(generation);
    };
    const deps: DependancesClientHttp = { transport, clock, quota: creerQuotaFactice(clock), hookToken: hook };

    const resultat = await executerRequete(deps, budgetDe(30, 60_000), contexte(), ROUTE_SANS_PARAMS);
    expect(resultat).toEqual({ ok: true });
    expect(appelsEffectues).toBe(1);
    expect(transport.appels).toHaveLength(2);
  });

  it("deuxième 401 : AUTH_REQUIRED, aucune troisième émission forcée au-delà du rejeu unique", async () => {
    const transport = creerTransportFactice([
      { status: 401, corps: { status: 401, errorCode: "Auth.InvalidToken" } },
      { status: 401, corps: { status: 401, errorCode: "Auth.InvalidToken" } },
    ]);
    const clock = creerHorlogeControlee(DEPART);
    const hook = creerHookTokenFactice({ accessToken: "acc-1", generation: 1 });
    const deps: DependancesClientHttp = { transport, clock, quota: creerQuotaFactice(clock), hookToken: hook };

    await expect(
      executerRequete(deps, budgetDe(30, 60_000), contexte(), ROUTE_SANS_PARAMS),
    ).rejects.toMatchObject({ erreur: { code: "AUTH_REQUIRED" } });
    expect(transport.appels).toHaveLength(2);
  });
});

describe("client.ts — critère #5 : 403 jamais de refresh ni de retry", () => {
  it("403 : le hook de refresh n'est jamais invoqué pour invalider, une seule émission", async () => {
    const transport = creerTransportFactice([{ status: 403, corps: { status: 403, errorCode: "Forbidden" } }]);
    const clock = creerHorlogeControlee(DEPART);
    const hook = creerHookTokenFactice({ accessToken: "acc-1", generation: 1 });
    const deps: DependancesClientHttp = { transport, clock, quota: creerQuotaFactice(clock), hookToken: hook };

    await expect(
      executerRequete(deps, budgetDe(30, 60_000), contexte(), ROUTE_SANS_PARAMS),
    ).rejects.toMatchObject({ erreur: { code: "PERMISSION_DENIED" } });
    expect(transport.appels).toHaveLength(1);
    expect(hook.appelsInvalider).toHaveLength(0);
  });
});

describe("client.ts — critère #6 : 429 et Retry-After", () => {
  it("Retry-After en secondes : cooldown enregistré sur le groupe, une seule relance, pas de backoff local", async () => {
    const transport = creerTransportFactice([
      { status: 429, headers: { "retry-after": "5" }, corps: {} },
      { status: 200, corps: { ok: true } },
    ]);
    const clock = instrumenterHorloge(creerHorlogeControlee(DEPART));
    const quota = creerQuotaFactice(clock);
    const hook = creerHookTokenFactice({ accessToken: "acc-1", generation: 1 });
    const deps: DependancesClientHttp = { transport, clock, quota, hookToken: hook };

    const resultat = await executerRequete(deps, budgetDe(30, 60_000), contexte("g"), ROUTE_SANS_PARAMS);
    expect(resultat).toEqual({ ok: true });
    expect(transport.appels).toHaveLength(2);
    expect(quota.cooldowns).toEqual([{ groupe: "g", fin: new Date(DEPART.getTime() + 5000) }]);
    expect(clock.attentes).not.toContain(1000);
  });

  it("Retry-After en date HTTP : attente au moins égale, cooldown enregistré", async () => {
    const dateCible = new Date(DEPART.getTime() + 10_000);
    const transport = creerTransportFactice([
      { status: 429, headers: { "retry-after": dateCible.toUTCString() }, corps: {} },
      { status: 200, corps: { ok: true } },
    ]);
    const clock = creerHorlogeControlee(DEPART);
    const quota = creerQuotaFactice(clock);
    const hook = creerHookTokenFactice({ accessToken: "acc-1", generation: 1 });
    const deps: DependancesClientHttp = { transport, clock, quota, hookToken: hook };

    await executerRequete(deps, budgetDe(30, 60_000), contexte("g2"), ROUTE_SANS_PARAMS);
    expect(quota.cooldowns[0]!.fin.getTime()).toBe(dateCible.getTime());
  });

  it("Retry-After invalide : backoff 1 s puis 2 s, aucun cooldown enregistré", async () => {
    const transport = creerTransportFactice([
      { status: 429, headers: { "retry-after": "pas-une-date" }, corps: {} },
      { status: 429, headers: {}, corps: {} },
      { status: 200, corps: { ok: true } },
    ]);
    const clock = instrumenterHorloge(creerHorlogeControlee(DEPART));
    const quota = creerQuotaFactice(clock);
    const hook = creerHookTokenFactice({ accessToken: "acc-1", generation: 1 });
    const deps: DependancesClientHttp = { transport, clock, quota, hookToken: hook };

    const promesse = executerRequete(deps, budgetDe(30, 60_000), contexte("g3"), ROUTE_SANS_PARAMS);
    await vi.waitFor(() => expect(transport.appels).toHaveLength(1));
    clock.avancer(1000);
    await vi.waitFor(() => expect(transport.appels).toHaveLength(2));
    clock.avancer(2000);
    await vi.waitFor(() => expect(transport.appels).toHaveLength(3));

    const resultat = await promesse;
    expect(resultat).toEqual({ ok: true });
    expect(quota.cooldowns).toHaveLength(0);
    expect(clock.attentes).toContain(1000);
    expect(clock.attentes).toContain(2000);
  });

  it("Retry-After > deadline : RESOLUTION_INCOMPLETE raison deadline, zéro émission supplémentaire", async () => {
    const dateCible = new Date(DEPART.getTime() + 120_000);
    const transport = creerTransportFactice([{ status: 429, headers: { "retry-after": dateCible.toUTCString() }, corps: {} }]);
    const clock = creerHorlogeControlee(DEPART);
    const quota = creerQuotaFactice(clock);
    const hook = creerHookTokenFactice({ accessToken: "acc-1", generation: 1 });
    const deps: DependancesClientHttp = { transport, clock, quota, hookToken: hook };

    await expect(
      executerRequete(deps, budgetDe(30, 60_000), contexte("g4"), ROUTE_SANS_PARAMS),
    ).rejects.toMatchObject({ erreur: { code: "RESOLUTION_INCOMPLETE", details: { raison: "deadline" } } });
    expect(transport.appels).toHaveLength(1);
  });
});

describe("client.ts — critère #7 : maximum trois tentatives GET", () => {
  it("503 répété : exactement 3 émissions puis UPSTREAM_UNAVAILABLE", async () => {
    const transport = creerTransportFactice([
      { status: 503, corps: {} },
      { status: 503, corps: {} },
      { status: 503, corps: {} },
    ]);
    const clock = creerHorlogeControlee(DEPART);
    const hook = creerHookTokenFactice({ accessToken: "acc-1", generation: 1 });
    const deps: DependancesClientHttp = { transport, clock, quota: creerQuotaFactice(clock), hookToken: hook };

    const promesse = executerRequete(deps, budgetDe(30, 60_000), contexte(), ROUTE_SANS_PARAMS);
    const assertion = expect(promesse).rejects.toMatchObject({ erreur: { code: "UPSTREAM_UNAVAILABLE" } });
    await vi.waitFor(() => expect(transport.appels).toHaveLength(1));
    clock.avancer(1000);
    await vi.waitFor(() => expect(transport.appels).toHaveLength(2));
    clock.avancer(2000);
    await vi.waitFor(() => expect(transport.appels).toHaveLength(3));

    await assertion;
    expect(transport.appels).toHaveLength(3);
  });

  it.each([400, 403, 404])("statut %i : exactement une émission, aucun retry", async (statut) => {
    const transport = creerTransportFactice([{ status: statut, corps: {} }]);
    const clock = creerHorlogeControlee(DEPART);
    const hook = creerHookTokenFactice({ accessToken: "acc-1", generation: 1 });
    const deps: DependancesClientHttp = { transport, clock, quota: creerQuotaFactice(clock), hookToken: hook };

    await expect(executerRequete(deps, budgetDe(30, 60_000), contexte(), ROUTE_SANS_PARAMS)).rejects.toBeDefined();
    expect(transport.appels).toHaveLength(1);
  });
});

describe("client.ts — critère #8 : budget, deadline, timeout", () => {
  it("budget épuisé par la préparation du token : arrêt avant émission, RESOLUTION_INCOMPLETE", async () => {
    const transport = creerTransportFactice([]);
    const clock = creerHorlogeControlee(DEPART);
    const hook = creerHookTokenFactice({ accessToken: "acc-1", generation: 1 });
    // Force une tentative d'auth consommant le seul budget disponible.
    const obtenirOriginal = hook.obtenirToken.bind(hook);
    hook.obtenirToken = async (p) => ({ ...(await obtenirOriginal(p)), tentativesAuth: 1 });
    const deps: DependancesClientHttp = { transport, clock, quota: creerQuotaFactice(clock), hookToken: hook };

    await expect(
      executerRequete(deps, budgetDe(1, 60_000), contexte(), ROUTE_SANS_PARAMS),
    ).rejects.toMatchObject({ erreur: { code: "RESOLUTION_INCOMPLETE", details: { raison: "budget" } } });
    expect(transport.appels).toHaveLength(0);
  });

  it("deadline déjà dépassée : arrêt immédiat, aucune émission", async () => {
    const transport = creerTransportFactice([]);
    const clock = creerHorlogeControlee(DEPART);
    clock.avancer(1000);
    const hook = creerHookTokenFactice({ accessToken: "acc-1", generation: 1 });
    const deps: DependancesClientHttp = { transport, clock, quota: creerQuotaFactice(clock), hookToken: hook };

    await expect(
      executerRequete(deps, budgetDe(30, 500), contexte(), ROUTE_SANS_PARAMS),
    ).rejects.toMatchObject({ erreur: { code: "RESOLUTION_INCOMPLETE", details: { raison: "deadline" } } });
    expect(transport.appels).toHaveLength(0);
  });

  it("timeout de requête = min(15s, temps restant), vérifié par l'horloge injectée", async () => {
    const transport = creerTransportJamaisResolu();
    const clock = instrumenterHorloge(creerHorlogeControlee(DEPART));
    const hook = creerHookTokenFactice({ accessToken: "acc-1", generation: 1 });
    const deps: DependancesClientHttp = { transport, clock, quota: creerQuotaFactice(clock), hookToken: hook };
    const controleur = new AbortController();

    const promesse = executerRequete(deps, budgetDe(30, 5_000, controleur.signal), contexte(), ROUTE_SANS_PARAMS);
    await vi.waitFor(() => expect(transport.appels).toHaveLength(1));
    // Le minuteur de la requête attend min(15000, 5000) = 5000, pas 15000.
    await vi.waitFor(() => expect(clock.attentes).toContain(5000));
    expect(clock.attentes).not.toContain(15_000);
    // Annule l'appel pour éviter toute nouvelle tentative une fois le timeout déclenché : seul le
    // délai calculé nous intéresse ici, pas le comportement de retry (déjà couvert ailleurs).
    controleur.abort();
    clock.avancer(5000);
    await expect(promesse).rejects.toMatchObject({ erreur: { code: "RESOLUTION_INCOMPLETE" } });
  });
});

describe("client.ts — critère #9 : corps malformé", () => {
  it("JSON invalide : UPSTREAM_SCHEMA_CHANGED, sans retry", async () => {
    const transport = {
      appels: [] as unknown[],
      async request() {
        (transport.appels as unknown[]).push(1);
        return { status: 200, headers: { "content-type": "application/json" }, body: "{ pas du json" };
      },
    };
    const clock = creerHorlogeControlee(DEPART);
    const hook = creerHookTokenFactice({ accessToken: "acc-1", generation: 1 });
    const deps: DependancesClientHttp = { transport, clock, quota: creerQuotaFactice(clock), hookToken: hook };

    await expect(
      executerRequete(deps, budgetDe(30, 60_000), contexte(), ROUTE_SANS_PARAMS),
    ).rejects.toMatchObject({ erreur: { code: "UPSTREAM_SCHEMA_CHANGED" } });
    expect(transport.appels).toHaveLength(1);
  });

  it("Content-Type non JSON : UPSTREAM_SCHEMA_CHANGED, sans retry", async () => {
    const transport = creerTransportFactice([{ status: 200, headers: { "content-type": "text/html" }, corps: { ok: true } }]);
    const clock = creerHorlogeControlee(DEPART);
    const hook = creerHookTokenFactice({ accessToken: "acc-1", generation: 1 });
    const deps: DependancesClientHttp = { transport, clock, quota: creerQuotaFactice(clock), hookToken: hook };

    await expect(
      executerRequete(deps, budgetDe(30, 60_000), contexte(), ROUTE_SANS_PARAMS),
    ).rejects.toMatchObject({ erreur: { code: "UPSTREAM_SCHEMA_CHANGED" } });
    expect(transport.appels).toHaveLength(1);
  });
});

describe("client.ts — critère #11 : annulation en attente n'émet rien", () => {
  it("signal déjà annulé avant la première tentative : zéro émission", async () => {
    const transport = creerTransportFactice([]);
    const clock = creerHorlogeControlee(DEPART);
    const hook = creerHookTokenFactice({ accessToken: "acc-1", generation: 1 });
    const deps: DependancesClientHttp = { transport, clock, quota: creerQuotaFactice(clock), hookToken: hook };
    const controleur = new AbortController();
    controleur.abort();

    await expect(
      executerRequete(deps, budgetDe(30, 60_000, controleur.signal), contexte(), ROUTE_SANS_PARAMS),
    ).rejects.toMatchObject({ erreur: { code: "RESOLUTION_INCOMPLETE", details: { raison: "annule" } } });
    expect(transport.appels).toHaveLength(0);
  });

  it("annulation pendant l'attente d'admission quota : zéro émission", async () => {
    const transport = creerTransportFactice([]);
    const clock = creerHorlogeControlee(DEPART);
    const quota = creerQuotaFactice(clock);
    quota.annulerSurAttente = true;
    const hook = creerHookTokenFactice({ accessToken: "acc-1", generation: 1 });
    const deps: DependancesClientHttp = { transport, clock, quota, hookToken: hook };
    const controleur = new AbortController();

    const promesse = executerRequete(deps, budgetDe(30, 60_000, controleur.signal), contexte(), ROUTE_SANS_PARAMS);
    controleur.abort();
    await expect(promesse).rejects.toMatchObject({ erreur: { code: "RESOLUTION_INCOMPLETE" } });
    expect(transport.appels).toHaveLength(0);
  });

  it("annulation pendant un backoff : aucune nouvelle tentative au-delà de celle en cours", async () => {
    const transport = creerTransportFactice([{ status: 503, corps: {} }]);
    const clock = creerHorlogeControlee(DEPART);
    const hook = creerHookTokenFactice({ accessToken: "acc-1", generation: 1 });
    const deps: DependancesClientHttp = { transport, clock, quota: creerQuotaFactice(clock), hookToken: hook };
    const controleur = new AbortController();

    const promesse = executerRequete(deps, budgetDe(30, 60_000, controleur.signal), contexte(), ROUTE_SANS_PARAMS);
    await vi.waitFor(() => expect(transport.appels).toHaveLength(1));
    controleur.abort();
    await expect(promesse).rejects.toMatchObject({ erreur: { code: "RESOLUTION_INCOMPLETE", details: { raison: "annule" } } });
    expect(transport.appels).toHaveLength(1);
  });
});

describe("client.ts — critère #12 : aucun secret ne fuite", () => {
  it("l'erreur et les requêtes capturées ne contiennent jamais le jeton ni la clé d'abonnement", async () => {
    const transport = creerTransportFactice([{ status: 403, corps: { message: "secret-jeton-ne-doit-pas-sortir" } }]);
    const clock = creerHorlogeControlee(DEPART);
    const hook = creerHookTokenFactice({ accessToken: "acces-tres-secret", generation: 1 });
    const deps: DependancesClientHttp = { transport, clock, quota: creerQuotaFactice(clock), hookToken: hook };

    let erreurCapturee: unknown;
    try {
      await executerRequete(deps, budgetDe(30, 60_000), contexte(), ROUTE_SANS_PARAMS);
    } catch (erreur) {
      erreurCapturee = erreur;
    }
    const serialise = JSON.stringify(erreurCapturee);
    expect(serialise).not.toContain("acces-tres-secret");
    expect(serialise).not.toContain("secret-jeton-ne-doit-pas-sortir");

    // Authorization n'apparaît que dans la requête envoyée au transport (origine autorisée), jamais ailleurs.
    expect(transport.appels[0]!.headers?.["Authorization"]).toBe("Bearer acces-tres-secret");
  });

  it("le journal stderr ne porte jamais le jeton, la clé d'abonnement, une URL ou une query", async () => {
    const transport = creerTransportFactice([{ status: 200, corps: { ok: true } }]);
    const clock = creerHorlogeControlee(DEPART);
    const hook = creerHookTokenFactice({ accessToken: "acces-tres-secret-journal", generation: 1 });
    const deps: DependancesClientHttp = { transport, clock, quota: creerQuotaFactice(clock), hookToken: hook };

    const lignes: string[] = [];
    const ecritureOriginale = process.stderr.write.bind(process.stderr);
    (process.stderr.write as unknown) = (chunk: string | Uint8Array): boolean => {
      lignes.push(typeof chunk === "string" ? chunk : chunk.toString());
      return true;
    };
    try {
      await executerRequete(deps, budgetDe(30, 60_000), contexte(), ROUTE_SANS_PARAMS);
    } finally {
      process.stderr.write = ecritureOriginale;
    }

    const journal = lignes.join("");
    expect(journal).not.toContain("acces-tres-secret-journal");
    expect(journal).not.toContain("ebp-subscription-key");
    expect(journal).not.toContain("api-developpeurs.ebp.com");
    expect(journal).not.toContain("?");
    const ligneParsee = JSON.parse(lignes[0]!.trim()) as Record<string, unknown>;
    expect(Object.keys(ligneParsee).sort()).toEqual(
      ["type", "requeteId", "routeId", "famille", "methode", "statut", "dureeMs", "tentative"].sort(),
    );
  });
});
