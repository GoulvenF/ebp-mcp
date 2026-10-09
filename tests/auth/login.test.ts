import { describe, expect, it } from "vitest";
import { login, logout } from "../../dist/index.js";
import {
  construireDependancesStockage,
  creerHorlogeControlee,
  creerOuvrirNavigateurCapture,
  creerRepertoireTemporaire,
  creerTransportFactice,
  laisserBoucleEvenements,
  nettoyerRepertoire,
  portLibre,
  reponseTokenValide,
  verrousAvecHookAvantAcquisition,
} from "./fixtures.js";

async function envoyerCallback(redirectUri: string, params: Record<string, string>): Promise<Response> {
  const url = new URL(redirectUri);
  for (const [cle, valeur] of Object.entries(params)) url.searchParams.set(cle, valeur);
  return fetch(url.toString());
}

describe("login.ts", () => {
  it("parcours complet : state + PKCE S256 envoyés, un seul échange, enregistrement persisté ready", async () => {
    const dir = await creerRepertoireTemporaire();
    try {
      const clock = creerHorlogeControlee(new Date("2026-01-01T00:00:00.000Z"));
      const stockage = construireDependancesStockage(dir, clock);
      const transport = creerTransportFactice([reponseTokenValide({ access_token: "a1", refresh_token: "r1", expires_in: 3600 })]);
      const navigateur = creerOuvrirNavigateurCapture();
      const port = await portLibre();
      const redirectUri = `http://127.0.0.1:${port}/callback`;

      const resultatPromesse = login(
        { transport, clock, ...stockage, ouvrirNavigateur: navigateur.ouvrir },
        {
          environnement: "prod",
          profilAuth: { clientId: "client-1", redirectUri, pkce: "required" },
          budgetRestant: 30,
          deadline: new Date(clock.now().getTime() + 60_000),
        },
      );

      await laisserBoucleEvenements();
      const urlAuth = navigateur.urlOuverte()!;
      expect(urlAuth.searchParams.get("code_challenge_method")).toBe("S256");
      expect(urlAuth.searchParams.get("code_challenge")).toBeTruthy();
      const state = urlAuth.searchParams.get("state")!;

      await envoyerCallback(redirectUri, { state, code: "code-recu" });
      const resultat = await resultatPromesse;

      expect(transport.appels).toHaveLength(1);
      expect(transport.appels[0]!.champsCorps.code_verifier).toBeTruthy();
      expect(resultat.enregistrement).toMatchObject({
        accessToken: "a1",
        refreshToken: "r1",
        generation: 1,
        state: "ready",
      });

      const persiste = await stockage.tokenStore.read(stockage.identite);
      expect(persiste).toEqual(resultat.enregistrement);
    } finally {
      await nettoyerRepertoire(dir);
    }
  });

  it("critère #12 (mode disabled) : aucun code_challenge envoyé à authorize", async () => {
    const dir = await creerRepertoireTemporaire();
    try {
      const clock = creerHorlogeControlee(new Date());
      const stockage = construireDependancesStockage(dir, clock);
      const transport = creerTransportFactice([reponseTokenValide()]);
      const navigateur = creerOuvrirNavigateurCapture();
      const port = await portLibre();
      const redirectUri = `http://127.0.0.1:${port}/callback`;

      const resultatPromesse = login(
        { transport, clock, ...stockage, ouvrirNavigateur: navigateur.ouvrir },
        {
          environnement: "prod",
          profilAuth: { clientId: "client-1", redirectUri, pkce: "disabled" },
          budgetRestant: 30,
          deadline: new Date(clock.now().getTime() + 60_000),
        },
      );

      await laisserBoucleEvenements();
      const urlAuth = navigateur.urlOuverte()!;
      expect(urlAuth.searchParams.has("code_challenge")).toBe(false);
      expect(urlAuth.searchParams.has("code_challenge_method")).toBe(false);
      const state = urlAuth.searchParams.get("state")!;

      await envoyerCallback(redirectUri, { state, code: "code-recu" });
      await resultatPromesse;

      expect(transport.appels[0]!.champsCorps.code_verifier).toBeUndefined();
    } finally {
      await nettoyerRepertoire(dir);
    }
  });

  it("critère #12 (mode required) : un échec du token endpoint ne déclenche aucune seconde requête sans code_verifier", async () => {
    const dir = await creerRepertoireTemporaire();
    try {
      const clock = creerHorlogeControlee(new Date());
      const stockage = construireDependancesStockage(dir, clock);
      const transport = creerTransportFactice([{ status: 400, corps: { error: "invalid_grant" } }]);
      const navigateur = creerOuvrirNavigateurCapture();
      const port = await portLibre();
      const redirectUri = `http://127.0.0.1:${port}/callback`;

      const resultatPromesse = login(
        { transport, clock, ...stockage, ouvrirNavigateur: navigateur.ouvrir },
        {
          environnement: "prod",
          profilAuth: { clientId: "client-1", redirectUri, pkce: "required" },
          budgetRestant: 30,
          deadline: new Date(clock.now().getTime() + 60_000),
        },
      );

      // Attaché avant tout autre `await` : évite un avertissement « unhandled rejection » bénin
      // lorsque `login()` rejette pendant qu'on attend encore la réponse HTTP du callback.
      const attenteRejet = expect(resultatPromesse).rejects.toMatchObject({ erreur: { code: "AUTH_REQUIRED" } });

      await laisserBoucleEvenements();
      const state = navigateur.urlOuverte()!.searchParams.get("state")!;
      await envoyerCallback(redirectUri, { state, code: "code-recu" });

      await attenteRejet;
      expect(transport.appels).toHaveLength(1);
      expect(await stockage.tokenStore.read(stockage.identite)).toBeNull();
    } finally {
      await nettoyerRepertoire(dir);
    }
  });

  it("critère #6 : réponse de login sans refresh_token ⇒ AUTH_REQUIRED, rien n'est persisté", async () => {
    const dir = await creerRepertoireTemporaire();
    try {
      const clock = creerHorlogeControlee(new Date());
      const stockage = construireDependancesStockage(dir, clock);
      const transport = creerTransportFactice([{ status: 200, corps: { access_token: "a", expires_in: 3600 } }]);
      const navigateur = creerOuvrirNavigateurCapture();
      const port = await portLibre();
      const redirectUri = `http://127.0.0.1:${port}/callback`;

      const resultatPromesse = login(
        { transport, clock, ...stockage, ouvrirNavigateur: navigateur.ouvrir },
        {
          environnement: "prod",
          profilAuth: { clientId: "client-1", redirectUri, pkce: "required" },
          budgetRestant: 30,
          deadline: new Date(clock.now().getTime() + 60_000),
        },
      );

      const attenteRejet = expect(resultatPromesse).rejects.toMatchObject({ erreur: { code: "AUTH_REQUIRED" } });

      await laisserBoucleEvenements();
      const state = navigateur.urlOuverte()!.searchParams.get("state")!;
      await envoyerCallback(redirectUri, { state, code: "code-recu" });

      await attenteRejet;
      expect(await stockage.tokenStore.read(stockage.identite)).toBeNull();
    } finally {
      await nettoyerRepertoire(dir);
    }
  });

  it("critère #3 : erreur OAuth (access_denied) ⇒ erreur explicite, aucun token persisté", async () => {
    const dir = await creerRepertoireTemporaire();
    try {
      const clock = creerHorlogeControlee(new Date());
      const stockage = construireDependancesStockage(dir, clock);
      const transport = creerTransportFactice([]);
      const navigateur = creerOuvrirNavigateurCapture();
      const port = await portLibre();
      const redirectUri = `http://127.0.0.1:${port}/callback`;

      const resultatPromesse = login(
        { transport, clock, ...stockage, ouvrirNavigateur: navigateur.ouvrir },
        {
          environnement: "prod",
          profilAuth: { clientId: "client-1", redirectUri, pkce: "required" },
          budgetRestant: 30,
          deadline: new Date(clock.now().getTime() + 60_000),
        },
      );

      const attenteRejet = expect(resultatPromesse).rejects.toMatchObject({ erreur: { code: "AUTH_REQUIRED" } });

      await laisserBoucleEvenements();
      const state = navigateur.urlOuverte()!.searchParams.get("state")!;
      await envoyerCallback(redirectUri, { state, error: "access_denied", error_description: "refuse" });

      await attenteRejet;
      expect(transport.appels).toHaveLength(0);
      expect(await stockage.tokenStore.read(stockage.identite)).toBeNull();
    } finally {
      await nettoyerRepertoire(dir);
    }
  });

  it("critère #11 : logout entre réservation et commit ⇒ commit refusé, aucun token ressuscité, derniereReservee monotone", async () => {
    const dir = await creerRepertoireTemporaire();
    try {
      const clock = creerHorlogeControlee(new Date());
      const stockage = construireDependancesStockage(dir, clock);
      const transport = creerTransportFactice([reponseTokenValide()]);
      const navigateur = creerOuvrirNavigateurCapture();
      const port = await portLibre();
      const redirectUri = `http://127.0.0.1:${port}/callback`;

      // Le 2ᵉ acquire du verrou d'identité pendant login() est celui du commit : on y injecte un
      // logout() concurrent réel, exécuté avec exactitude (sans dépendre d'un timing réel).
      const verrousAvecLogoutConcurrent = verrousAvecHookAvantAcquisition(stockage.verrous, stockage.nomVerrou, 2, async () => {
        await logout(
          { verrous: stockage.verrous, store: stockage.store, tokenStore: stockage.tokenStore, identite: stockage.identite, nomVerrou: stockage.nomVerrou, cheminGenerations: stockage.cheminGenerations },
          { deadline: new Date(clock.now().getTime() + 10_000) },
        );
      });

      const resultatPromesse = login(
        {
          transport,
          clock,
          ...stockage,
          verrous: verrousAvecLogoutConcurrent,
          ouvrirNavigateur: navigateur.ouvrir,
        },
        {
          environnement: "prod",
          profilAuth: { clientId: "client-1", redirectUri, pkce: "required" },
          budgetRestant: 30,
          deadline: new Date(clock.now().getTime() + 60_000),
        },
      );

      const attenteRejet = expect(resultatPromesse).rejects.toMatchObject({ erreur: { code: "AUTH_REQUIRED" } });

      await laisserBoucleEvenements();
      const state = navigateur.urlOuverte()!.searchParams.get("state")!;
      await envoyerCallback(redirectUri, { state, code: "code-recu" });

      await attenteRejet;
      expect(await stockage.tokenStore.read(stockage.identite)).toBeNull();

      const generations = await stockage.store.lire<{
        schemaVersion: number;
        derniereReservee: number;
        revoqueeJusqua: number;
      }>(stockage.cheminGenerations, "auth-generations");
      expect(generations).toEqual({ schemaVersion: 1, derniereReservee: 1, revoqueeJusqua: 1 });
    } finally {
      await nettoyerRepertoire(dir);
    }
  });
});
