// `creerConsentementMock` (D-T13-6, GOU-371) : lit state/redirect_uri/code_challenge de l'URL
// d'autorisation, émet un code lié au challenge via l'identité simulée partagée, puis fait un VRAI
// GET loopback (jamais vers EBP) sur `redirect_uri?code=…&state=…`.
import { createHash, randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { creerConsentementMock, creerIdentiteMock } from "../../dist/index.js";
import { portLibre } from "../auth/fixtures.js";

/**
 * `creerConsentementMock` résout `ouvrirNavigateur` immédiatement (D-T13-6) — le GET loopback part
 * en tâche de fond, pour rester compatible avec `login()` qui ne démarre son serveur de callback
 * qu'après cette résolution (`src/auth/login.ts`). Les assertions qui en dépendent attendent donc
 * la requête plutôt que de la supposer déjà arrivée.
 */
async function attendreRequete(requetes: readonly unknown[], max = 50): Promise<void> {
  for (let tentative = 0; tentative < max && requetes.length === 0; tentative += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

interface RequeteCapturee {
  readonly url: string;
}

async function demarrerCallback(): Promise<{ port: number; requetes: RequeteCapturee[]; fermer: () => Promise<void> }> {
  const requetes: RequeteCapturee[] = [];
  const serveur: Server = createServer((req, res) => {
    requetes.push({ url: req.url ?? "/" });
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
  });
  const port = await new Promise<number>((resolve, reject) => {
    serveur.once("error", reject);
    serveur.listen(0, "127.0.0.1", () => {
      const adresse = serveur.address();
      resolve(typeof adresse === "object" && adresse !== null ? adresse.port : 0);
    });
  });
  return {
    port,
    requetes,
    fermer: () => new Promise<void>((resolve) => serveur.close(() => resolve())),
  };
}

describe("creerConsentementMock (D-T13-6)", () => {
  let callback: { port: number; requetes: RequeteCapturee[]; fermer: () => Promise<void> } | undefined;

  afterEach(async () => {
    await callback?.fermer();
    callback = undefined;
  });

  it("fait un GET loopback réel sur redirect_uri avec `code`/`state`, jamais vers EBP", async () => {
    callback = await demarrerCallback();
    const espionFetch = vi.spyOn(globalThis, "fetch");
    const identite = creerIdentiteMock();
    const consentement = creerConsentementMock(identite);

    const redirectUri = `http://127.0.0.1:${callback.port}/callback`;
    const urlAutorize = new URL("https://api-login.ebp.com/connect/authorize");
    urlAutorize.searchParams.set("response_type", "code");
    urlAutorize.searchParams.set("client_id", "client-test");
    urlAutorize.searchParams.set("redirect_uri", redirectUri);
    urlAutorize.searchParams.set("state", "etat-de-test");
    urlAutorize.searchParams.set("code_challenge", "challenge-arbitraire");
    urlAutorize.searchParams.set("code_challenge_method", "S256");

    await consentement(urlAutorize.toString());
    await attendreRequete(callback.requetes);

    expect(callback.requetes).toHaveLength(1);
    const urlRecue = new URL(callback.requetes[0]!.url, redirectUri);
    expect(urlRecue.searchParams.get("state")).toBe("etat-de-test");
    expect(urlRecue.searchParams.get("code")).toBeTruthy();
    expect(urlRecue.searchParams.get("code")?.startsWith("mock-code-")).toBe(true);

    // Le fetch émis par le consentement simulé vise bien le loopback local, jamais `api-login.ebp.com`.
    expect(espionFetch).toHaveBeenCalledTimes(1);
    const urlAppelee = espionFetch.mock.calls[0]![0] as string;
    expect(new URL(urlAppelee.toString()).hostname).toBe("127.0.0.1");
    espionFetch.mockRestore();
  });

  it("le code émis est reconnu par la même `IdentiteMock` lors de l'échange `authorization_code`", async () => {
    callback = await demarrerCallback();
    const identite = creerIdentiteMock();
    const consentement = creerConsentementMock(identite);
    const redirectUri = `http://127.0.0.1:${callback.port}/callback`;
    // PKCE obligatoire (profil `pkce: required`, D-T13-6) : l'URL d'autorisation porte un
    // `code_challenge` S256, et l'échange ci-dessous rejoue le `code_verifier` correspondant.
    const verifier = randomBytes(32).toString("base64url");
    const challenge = createHash("sha256").update(verifier, "utf8").digest("base64url");
    const urlAutorize = new URL("https://api-login.ebp.com/connect/authorize");
    urlAutorize.searchParams.set("redirect_uri", redirectUri);
    urlAutorize.searchParams.set("state", "s");
    urlAutorize.searchParams.set("code_challenge", challenge);
    urlAutorize.searchParams.set("code_challenge_method", "S256");

    await consentement(urlAutorize.toString());
    await attendreRequete(callback.requetes);
    const urlRecue = new URL(callback.requetes[0]!.url, redirectUri);
    const code = urlRecue.searchParams.get("code")!;

    const reponse = await identite.traiterRequeteToken(
      new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        code_verifier: verifier,
      }).toString(),
    );
    expect(reponse.status).toBe(200);
  });
});
