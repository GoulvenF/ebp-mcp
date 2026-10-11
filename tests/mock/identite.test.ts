// Critère d'acceptation #6 (GOU-371, T13-1) : identité OAuth simulée — code rejoué, mauvais
// `code_verifier`, rotation du refresh token.
import { createHash, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { creerIdentiteMock, PREFIXE_REFRESH_TOKEN_MOCK } from "../../dist/index.js";

function pkceS256(verifier: string): string {
  return createHash("sha256").update(verifier, "utf8").digest("base64url");
}

function corpsAuthorizationCode(params: Record<string, string>): string {
  return new URLSearchParams({ grant_type: "authorization_code", ...params }).toString();
}

function corpsRefresh(refreshToken: string): string {
  return new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }).toString();
}

describe("creerIdentiteMock (D-T13-5, critère #6)", () => {
  it("authorization_code valide (PKCE S256 correct) renvoie des tokens synthétiques", async () => {
    const identite = creerIdentiteMock();
    const verifier = randomBytes(32).toString("base64url");
    const code = identite.emettreCode({ redirectUri: "http://127.0.0.1:1/callback", codeChallenge: pkceS256(verifier) });

    const reponse = await identite.traiterRequeteToken(
      corpsAuthorizationCode({ code, redirect_uri: "http://127.0.0.1:1/callback", code_verifier: verifier }),
    );
    expect(reponse.status).toBe(200);
    const corps = JSON.parse(reponse.body) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      id_token: string;
      token_type: string;
    };
    expect(corps.access_token.startsWith("mock-at-")).toBe(true);
    expect(corps.refresh_token.startsWith("mock-rt-")).toBe(true);
    expect(corps.expires_in).toBe(3600);
    expect(corps.token_type).toBe("Bearer");
    const segments = corps.id_token.split(".");
    expect(segments).toHaveLength(3);
    const claims = JSON.parse(Buffer.from(segments[1]!, "base64url").toString("utf8")) as {
      sub: string;
      name: string;
      email: string;
      "ebp.email": string;
    };
    expect(claims.sub).toBeTruthy();
    expect(claims.name).toBeTruthy();
    expect(claims.email.endsWith("@example.invalid")).toBe(true);
    expect(claims["ebp.email"].endsWith("@example.invalid")).toBe(true);
  });

  it("un code rejoué (déjà consommé) donne `invalid_grant`", async () => {
    const identite = creerIdentiteMock();
    const verifier = randomBytes(32).toString("base64url");
    const code = identite.emettreCode({ redirectUri: "http://127.0.0.1:1/callback", codeChallenge: pkceS256(verifier) });
    const corpsRequete = corpsAuthorizationCode({ code, redirect_uri: "http://127.0.0.1:1/callback", code_verifier: verifier });

    const premier = await identite.traiterRequeteToken(corpsRequete);
    expect(premier.status).toBe(200);

    const second = await identite.traiterRequeteToken(corpsRequete);
    expect(second.status).toBe(400);
    expect(JSON.parse(second.body)).toEqual({ error: "invalid_grant" });
  });

  it("un code totalement inconnu donne `invalid_grant`", async () => {
    const identite = creerIdentiteMock();
    const reponse = await identite.traiterRequeteToken(
      corpsAuthorizationCode({ code: "mock-code-jamais-emis", redirect_uri: "http://127.0.0.1:1/callback" }),
    );
    expect(reponse.status).toBe(400);
    expect(JSON.parse(reponse.body)).toEqual({ error: "invalid_grant" });
  });

  it("un mauvais `code_verifier` (ne correspond pas au challenge) donne `invalid_grant`", async () => {
    const identite = creerIdentiteMock();
    const verifier = randomBytes(32).toString("base64url");
    const code = identite.emettreCode({ redirectUri: "http://127.0.0.1:1/callback", codeChallenge: pkceS256(verifier) });

    const reponse = await identite.traiterRequeteToken(
      corpsAuthorizationCode({
        code,
        redirect_uri: "http://127.0.0.1:1/callback",
        code_verifier: "un-verifier-totalement-different",
      }),
    );
    expect(reponse.status).toBe(400);
    expect(JSON.parse(reponse.body)).toEqual({ error: "invalid_grant" });
  });

  it("un `redirect_uri` différent de celui de l'autorisation donne `invalid_grant`", async () => {
    const identite = creerIdentiteMock();
    const code = identite.emettreCode({ redirectUri: "http://127.0.0.1:1/callback" });
    const reponse = await identite.traiterRequeteToken(
      corpsAuthorizationCode({ code, redirect_uri: "http://127.0.0.1:2/callback" }),
    );
    expect(reponse.status).toBe(400);
    expect(JSON.parse(reponse.body)).toEqual({ error: "invalid_grant" });
  });

  it("PKCE obligatoire (profil `pkce: required`) : un code émis sans `code_challenge` donne `invalid_grant` à l'échange, quel que soit le `code_verifier`", async () => {
    const identite = creerIdentiteMock();
    const code = identite.emettreCode({ redirectUri: "http://127.0.0.1:1/callback" });
    const reponse = await identite.traiterRequeteToken(
      corpsAuthorizationCode({ code, redirect_uri: "http://127.0.0.1:1/callback", code_verifier: "peu-importe" }),
    );
    expect(reponse.status).toBe(400);
    expect(JSON.parse(reponse.body)).toEqual({ error: "invalid_grant" });
  });

  it("refresh_token : accepte tout `mock-rt-…` émis et non consommé, puis fait tourner (rotation)", async () => {
    const identite = creerIdentiteMock();
    const verifier = randomBytes(32).toString("base64url");
    const code = identite.emettreCode({ redirectUri: "http://127.0.0.1:1/callback", codeChallenge: pkceS256(verifier) });
    const premierEchange = await identite.traiterRequeteToken(
      corpsAuthorizationCode({
        code,
        redirect_uri: "http://127.0.0.1:1/callback",
        code_verifier: verifier,
      }),
    );
    const { refresh_token: refreshInitial } = JSON.parse(premierEchange.body) as { refresh_token: string };

    const reponseRefresh = await identite.traiterRequeteToken(corpsRefresh(refreshInitial));
    expect(reponseRefresh.status).toBe(200);
    const { refresh_token: refreshSuivant, access_token: accessSuivant } = JSON.parse(reponseRefresh.body) as {
      refresh_token: string;
      access_token: string;
    };
    expect(refreshSuivant).not.toBe(refreshInitial);
    expect(accessSuivant.startsWith("mock-at-")).toBe(true);

    // L'ancien refresh token devient invalide après usage (rotation, critère #6).
    const rejoueAncien = await identite.traiterRequeteToken(corpsRefresh(refreshInitial));
    expect(rejoueAncien.status).toBe(400);
    expect(JSON.parse(rejoueAncien.body)).toEqual({ error: "invalid_grant" });

    // Le nouveau refresh token, lui, est toujours valide (une seule rotation, pas une révocation globale).
    const reponseSuivante = await identite.traiterRequeteToken(corpsRefresh(refreshSuivant));
    expect(reponseSuivante.status).toBe(200);
  });

  it("un `mock-rt-…` jamais émis par cette instance est accepté une fois (autre processus `login --mock`), puis un second usage donne `invalid_grant`", async () => {
    const identite = creerIdentiteMock();
    const refreshDunAutreProcessus = `${PREFIXE_REFRESH_TOKEN_MOCK}${randomBytes(16).toString("hex")}`;

    const premier = await identite.traiterRequeteToken(corpsRefresh(refreshDunAutreProcessus));
    expect(premier.status).toBe(200);

    const second = await identite.traiterRequeteToken(corpsRefresh(refreshDunAutreProcessus));
    expect(second.status).toBe(400);
    expect(JSON.parse(second.body)).toEqual({ error: "invalid_grant" });
  });

  it("un token sans le préfixe `mock-rt-` donne `invalid_grant`", async () => {
    const identite = creerIdentiteMock();
    const reponse = await identite.traiterRequeteToken(corpsRefresh("un-token-sans-le-bon-prefixe"));
    expect(reponse.status).toBe(400);
    expect(JSON.parse(reponse.body)).toEqual({ error: "invalid_grant" });
  });

  it("un grant_type non supporté donne `unsupported_grant_type`", async () => {
    const identite = creerIdentiteMock();
    const reponse = await identite.traiterRequeteToken(new URLSearchParams({ grant_type: "client_credentials" }).toString());
    expect(reponse.status).toBe(400);
    expect(JSON.parse(reponse.body)).toEqual({ error: "unsupported_grant_type" });
  });
});
