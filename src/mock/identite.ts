/**
 * Identité OAuth simulée (T13-1) : fabrique à état consommée par `creerTransportMock` pour
 * répondre aux `POST /connect/token` de l'hôte identité, sans aucune émission réseau externe.
 * Toutes les valeurs émises (tokens, claims, email) sont synthétiques.
 */
import { createHash, randomBytes } from "node:crypto";
import type { HttpResponseSpec } from "../ports/http-transport.js";

/** Préfixe exact exigé par `creerTransportMock`/07 §3 pour un access token mock valide. */
export const PREFIXE_ACCESS_TOKEN_MOCK = "mock-at-";
export const PREFIXE_REFRESH_TOKEN_MOCK = "mock-rt-";

export interface ParametresEmissionCode {
  readonly redirectUri: string;
  readonly codeChallenge?: string;
}

export interface IdentiteMock {
  /** Émet un code d'autorisation à usage unique, lié au `redirectUri`/`code_challenge` reçus. */
  emettreCode(params: ParametresEmissionCode): string;
  /** Traite un corps `application/x-www-form-urlencoded` de `POST /connect/token`. */
  traiterRequeteToken(corpsFormulaire: string): Promise<HttpResponseSpec>;
}

interface EnregistrementCode {
  readonly redirectUri: string;
  readonly codeChallenge: string | undefined;
  utilise: boolean;
}

function nouveauJeton(prefixe: string): string {
  return `${prefixe}${randomBytes(16).toString("hex")}`;
}

/** `id_token` JWT NON SIGNÉ (3 segments base64url, décodable par `decoderClaimsPourAffichage`). */
function jetonIdNonSigne(): string {
  const entete = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" }), "utf8").toString("base64url");
  const maintenant = Math.floor(Date.now() / 1000);
  const charge = Buffer.from(
    JSON.stringify({
      sub: "demo-user",
      name: "Démo EBP",
      email: "demo@example.invalid",
      "ebp.email": "demo@example.invalid",
      given_name: "Démo",
      family_name: "EBP",
      iat: maintenant,
      exp: maintenant + 3600,
    }),
    "utf8",
  ).toString("base64url");
  return `${entete}.${charge}.`;
}

function reponseJson(status: number, corps: unknown): HttpResponseSpec {
  return { status, headers: { "content-type": "application/json" }, body: JSON.stringify(corps) };
}

function reponseInvalidGrant(): HttpResponseSpec {
  return reponseJson(400, { error: "invalid_grant" });
}

/**
 * `creerIdentiteMock` (T13-1) : une seule instance doit être partagée entre `creerTransportMock`
 * (traitement de `/connect/token`) et `creerConsentementMock` (émission du code), pour que la
 * rotation des refresh tokens et l'usage unique des codes soient cohérents sur le même processus.
 */
export function creerIdentiteMock(): IdentiteMock {
  const codes = new Map<string, EnregistrementCode>();
  // D-T13-6 : « au refresh, l'endpoint simulé accepte tout refresh token au format mock
  // (préfixe `mock-rt-`) qui n'a pas déjà été consommé dans ce processus » — pour que
  // `serve --mock` (T13-3) accepte un token écrit par un `login --mock` d'un AUTRE processus.
  // On ne suit donc que les refresh tokens déjà CONSOMMÉS, jamais l'ensemble des tokens émis.
  const refreshConsommes = new Set<string>();

  function emettreTokens(): HttpResponseSpec {
    const refresh = nouveauJeton(PREFIXE_REFRESH_TOKEN_MOCK);
    return reponseJson(200, {
      access_token: nouveauJeton(PREFIXE_ACCESS_TOKEN_MOCK),
      refresh_token: refresh,
      expires_in: 3600,
      id_token: jetonIdNonSigne(),
      token_type: "Bearer",
    });
  }

  return {
    emettreCode(params: ParametresEmissionCode): string {
      const code = nouveauJeton("mock-code-");
      codes.set(code, { redirectUri: params.redirectUri, codeChallenge: params.codeChallenge, utilise: false });
      return code;
    },

    async traiterRequeteToken(corpsFormulaire: string): Promise<HttpResponseSpec> {
      const champs = new URLSearchParams(corpsFormulaire);
      const grantType = champs.get("grant_type");

      if (grantType === "authorization_code") {
        const code = champs.get("code") ?? "";
        const enregistrement = codes.get(code);
        if (enregistrement === undefined || enregistrement.utilise) {
          return reponseInvalidGrant();
        }
        if (champs.get("redirect_uri") !== enregistrement.redirectUri) {
          return reponseInvalidGrant();
        }
        if (enregistrement.codeChallenge === undefined) {
          // Profil `pkce: required` (D-T13-6, D-T13-7) : un code émis sans challenge ne peut jamais
          // être échangé, quel que soit le `code_verifier` fourni.
          return reponseInvalidGrant();
        }
        const verifier = champs.get("code_verifier") ?? "";
        const challengeCalcule = createHash("sha256").update(verifier, "utf8").digest("base64url");
        if (challengeCalcule !== enregistrement.codeChallenge) {
          return reponseInvalidGrant();
        }
        enregistrement.utilise = true;
        return emettreTokens();
      }

      if (grantType === "refresh_token") {
        const refresh = champs.get("refresh_token") ?? "";
        if (!refresh.startsWith(PREFIXE_REFRESH_TOKEN_MOCK) || refreshConsommes.has(refresh)) {
          return reponseInvalidGrant();
        }
        refreshConsommes.add(refresh);
        return emettreTokens();
      }

      return reponseJson(400, { error: "unsupported_grant_type" });
    },
  };
}
