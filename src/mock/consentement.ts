/**
 * Consentement OAuth simulé (T13-1) : compatible avec `DependancesLogin.ouvrirNavigateur`
 * (`src/auth/login.ts`). Parse l'URL d'autorisation (`state`, `redirect_uri`, `code_challenge`),
 * émet un code à usage unique via l'identité simulée partagée, puis effectue un VRAI GET loopback
 * (fetch natif Node) sur `redirect_uri`, jamais vers EBP — uniquement vers le serveur HTTP local
 * démarré par `attendreCallback` (`src/auth/callback-loopback.ts`).
 */
import type { IdentiteMock } from "./identite.js";

/**
 * `login()` n'attend l'ouverture du navigateur qu'AVANT de démarrer son serveur de callback
 * (`src/auth/login.ts`) : `ouvrirNavigateur` doit donc résoudre immédiatement, comme le ferait un
 * vrai lancement de navigateur (voir `creerOuvrirNavigateurCapture`, `tests/auth/fixtures.ts`).
 * Le GET loopback réel est donc envoyé en tâche de fond, jamais attendu ici, avec de courtes
 * retentatives tant que `attendreCallback` n'a pas encore commencé à écouter.
 */
async function envoyerCallbackAvecRetentatives(url: string, tentativesMax = 50, delaiMs = 10): Promise<void> {
  for (let tentative = 0; tentative < tentativesMax; tentative += 1) {
    try {
      await fetch(url);
      return;
    } catch (erreur) {
      if (tentative === tentativesMax - 1) throw erreur;
      await new Promise((resolve) => setTimeout(resolve, delaiMs));
    }
  }
}

/**
 * `creerConsentementMock` (T13-1) : `identite` DOIT être la même instance que celle passée à
 * `creerTransportMock` (partage d'état obligatoire), pour que le code émis ici soit reconnu par
 * le traitement de `POST /connect/token`.
 */
export function creerConsentementMock(identite: IdentiteMock): (url: string) => Promise<void> {
  return async (urlAutorize: string): Promise<void> => {
    const url = new URL(urlAutorize);
    const state = url.searchParams.get("state") ?? "";
    const redirectUri = url.searchParams.get("redirect_uri") ?? "";
    const codeChallenge = url.searchParams.get("code_challenge") ?? undefined;
    // `code_challenge_method` n'est jamais autre chose que S256 côté `login()` (`src/auth/pkce.ts`,
    // `src/auth/login.ts`) : lu uniquement pour documenter l'intention, aucune autre méthode n'est
    // jamais traitée différemment ici.
    void url.searchParams.get("code_challenge_method");

    const code =
      codeChallenge === undefined
        ? identite.emettreCode({ redirectUri })
        : identite.emettreCode({ redirectUri, codeChallenge });

    const callback = new URL(redirectUri);
    callback.searchParams.set("code", code);
    callback.searchParams.set("state", state);

    void envoyerCallbackAvecRetentatives(callback.toString());
  };
}
