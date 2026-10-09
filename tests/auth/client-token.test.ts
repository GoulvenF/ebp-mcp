import { describe, expect, it } from "vitest";
import { echangerToken, EXPIRES_IN_DEFAUT_S, resoudreExpiresIn } from "../../dist/index.js";
import { creerHorlogeControlee, creerTransportFactice, reponseTokenValide } from "./fixtures.js";

const ENVIRONNEMENT = "prod";

function fenetre(deadlineMs: number, budgetRestant = 30) {
  return { budgetRestant, deadline: new Date(Date.now() + deadlineMs) };
}

describe("client-token.ts — requête et réponse (décision 8)", () => {
  it("échange authorization_code : corps form attendu, requête attendue calculée à la main", async () => {
    const clock = creerHorlogeControlee(new Date("2026-01-01T00:00:00Z"));
    const transport = creerTransportFactice([reponseTokenValide()]);

    const resultat = await echangerToken({ transport, clock }, fenetre(60_000), ENVIRONNEMENT, {
      grant: "authorization_code",
      clientId: "client-abc",
      redirectUri: "http://127.0.0.1:4100/callback",
      code: "code-recu",
      codeVerifier: "verifier-recu",
    });

    expect(resultat.ok).toBe(true);
    expect(transport.appels).toHaveLength(1);
    const appel = transport.appels[0]!;
    expect(appel.method).toBe("POST");
    expect(appel.url).toBe("https://api-login.ebp.com/connect/token");
    expect(appel.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(appel.champsCorps).toEqual({
      grant_type: "authorization_code",
      client_id: "client-abc",
      redirect_uri: "http://127.0.0.1:4100/callback",
      code: "code-recu",
      code_verifier: "verifier-recu",
    });
  });

  it("échange refresh_token : corps form attendu, enregistrement attendu calculé à la main", async () => {
    const clock = creerHorlogeControlee(new Date("2026-01-01T00:00:00Z"));
    const transport = creerTransportFactice([
      reponseTokenValide({ access_token: "nouveau-access", refresh_token: "nouveau-refresh", expires_in: 1800 }),
    ]);

    const resultat = await echangerToken({ transport, clock }, fenetre(60_000), ENVIRONNEMENT, {
      grant: "refresh_token",
      clientId: "client-abc",
      refreshToken: "ancien-refresh",
    });

    expect(resultat).toEqual({
      ok: true,
      accessToken: "nouveau-access",
      refreshToken: "nouveau-refresh",
      expiresInSecondes: 1800,
      claims: null,
    });
    expect(transport.appels[0]!.champsCorps).toEqual({
      grant_type: "refresh_token",
      client_id: "client-abc",
      refresh_token: "ancien-refresh",
    });
  });

  it("inclut client_secret révélé uniquement lorsqu'il est fourni", async () => {
    const clock = creerHorlogeControlee(new Date());
    const transport = creerTransportFactice([reponseTokenValide()]);
    const secretFactice = { reveler: () => "secret-en-clair" } as unknown as import("../../dist/index.js").Secret;

    await echangerToken({ transport, clock }, fenetre(60_000), ENVIRONNEMENT, {
      grant: "refresh_token",
      clientId: "client-abc",
      clientSecret: secretFactice,
      refreshToken: "r",
    });

    expect(transport.appels[0]!.champsCorps.client_secret).toBe("secret-en-clair");
  });
});

describe("client-token.ts — critère #6 : absence de refresh_token", () => {
  it("login sans refresh_token dans la réponse : ok mais refreshToken null (l'appelant décide AUTH_REQUIRED)", async () => {
    const clock = creerHorlogeControlee(new Date());
    const transport = creerTransportFactice([{ status: 200, corps: { access_token: "a", expires_in: 3600 } }]);

    const resultat = await echangerToken({ transport, clock }, fenetre(60_000), ENVIRONNEMENT, {
      grant: "authorization_code",
      clientId: "c",
      redirectUri: "http://127.0.0.1:4100/callback",
      code: "code",
    });

    expect(resultat).toEqual({ ok: true, accessToken: "a", refreshToken: null, expiresInSecondes: 3600, claims: null });
  });
});

describe("client-token.ts — critère #7 : résolution expires_in", () => {
  it.each([
    [undefined, EXPIRES_IN_DEFAUT_S],
    ["abc", EXPIRES_IN_DEFAUT_S],
    [0, EXPIRES_IN_DEFAUT_S],
    [-1, EXPIRES_IN_DEFAUT_S],
    [99999, EXPIRES_IN_DEFAUT_S],
    [3600, 3600],
    [1, 1],
    ["1800", 1800],
  ])("resoudreExpiresIn(%j) === %d", (valeur, attendu) => {
    expect(resoudreExpiresIn(valeur)).toBe(attendu);
  });

  it("une réponse avec expires_in invalide résout expiresAt = now + 300s côté appelant", async () => {
    const clock = creerHorlogeControlee(new Date());
    const transport = creerTransportFactice([reponseTokenValide({ expires_in: "abc" })]);

    const resultat = await echangerToken({ transport, clock }, fenetre(60_000), ENVIRONNEMENT, {
      grant: "refresh_token",
      clientId: "c",
      refreshToken: "r",
    });

    expect(resultat.ok).toBe(true);
    expect(resultat.ok && resultat.expiresInSecondes).toBe(EXPIRES_IN_DEFAUT_S);
  });
});

describe("client-token.ts — décision 2 : aucun retry, budget et deadline", () => {
  it("budget épuisé : échoue avant toute émission réseau", async () => {
    const clock = creerHorlogeControlee(new Date());
    const transport = creerTransportFactice([]);

    const resultat = await echangerToken({ transport, clock }, fenetre(60_000, 0), ENVIRONNEMENT, {
      grant: "refresh_token",
      clientId: "c",
      refreshToken: "r",
    });

    expect(resultat).toEqual({ ok: false, categorie: "budget_epuise" });
    expect(transport.appels).toHaveLength(0);
  });

  it("deadline déjà dépassée : échoue avant toute émission réseau", async () => {
    const clock = creerHorlogeControlee(new Date());
    const transport = creerTransportFactice([]);

    const resultat = await echangerToken(
      { transport, clock },
      { budgetRestant: 30, deadline: new Date(clock.now().getTime() - 1) },
      ENVIRONNEMENT,
      { grant: "refresh_token", clientId: "c", refreshToken: "r" },
    );

    expect(resultat).toEqual({ ok: false, categorie: "deadline_depassee" });
    expect(transport.appels).toHaveLength(0);
  });

  it("un échec réseau n'est jamais rejoué : un seul appel émis", async () => {
    const clock = creerHorlogeControlee(new Date());
    const transport = creerTransportFactice([{ erreurReseau: true }]);

    const resultat = await echangerToken({ transport, clock }, fenetre(60_000), ENVIRONNEMENT, {
      grant: "refresh_token",
      clientId: "c",
      refreshToken: "r",
    });

    expect(resultat).toEqual({ ok: false, categorie: "reseau" });
    expect(transport.appels).toHaveLength(1);
  });

  it("invalid_grant est reconnu et distinct d'un autre échec http", async () => {
    const clock = creerHorlogeControlee(new Date());
    const transport = creerTransportFactice([{ status: 400, corps: { error: "invalid_grant" } }]);

    const resultat = await echangerToken({ transport, clock }, fenetre(60_000), ENVIRONNEMENT, {
      grant: "refresh_token",
      clientId: "c",
      refreshToken: "r",
    });

    expect(resultat).toEqual({ ok: false, categorie: "invalid_grant", statutHttp: 400 });
  });

  it("une réponse JSON malformée échoue en categorie malformee, sans retry", async () => {
    const clock = creerHorlogeControlee(new Date());
    const transport: import("../../dist/index.js").HttpTransport = {
      async request() {
        return { status: 200, headers: {}, body: "<<< pas du json >>>" };
      },
    };

    const resultat = await echangerToken({ transport, clock }, fenetre(60_000), ENVIRONNEMENT, {
      grant: "refresh_token",
      clientId: "c",
      refreshToken: "r",
    });

    expect(resultat).toEqual({ ok: false, categorie: "malformee" });
  });
});
