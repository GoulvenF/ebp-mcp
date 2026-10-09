import { describe, expect, it } from "vitest";
import {
  DELAI_ABANDON_REFRESH_MS,
  MARGE_EXPIRATION_MS,
  assurerTokenValide,
  estFrais,
} from "../../dist/index.js";
import type { EnregistrementToken, EtatGenerations, HttpRequestSpec, StoreJson } from "../../dist/index.js";
import {
  construireDependancesStockage,
  creerHorlogeControlee,
  creerRepertoireTemporaire,
  creerTransportFactice,
  nettoyerRepertoire,
  reponseTokenValide,
} from "./fixtures.js";

const DEPART = new Date("2026-01-01T00:00:00.000Z");

function enregistrementExpire(generation: number, clock: { now(): Date }): EnregistrementToken {
  return {
    accessToken: "ancien-access",
    refreshToken: "ancien-refresh",
    expiresAt: new Date(clock.now().getTime() - 1000).toISOString(),
    refreshedAt: new Date(clock.now().getTime() - 3600_000).toISOString(),
    refreshExpiresAtEstimate: null,
    generation,
    state: "ready",
  };
}

async function seedGenerations(
  stockage: { store: StoreJson; cheminGenerations: string },
  etat: EtatGenerations,
): Promise<void> {
  await stockage.store.ecrire(stockage.cheminGenerations, "auth-generations", etat);
}

describe("cycle.ts — estFrais / constantes", () => {
  it("estFrais : faux si expiresAt - 60s < now, vrai sinon", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const frais: EnregistrementToken = {
      accessToken: "a",
      refreshToken: "r",
      expiresAt: new Date(now.getTime() + MARGE_EXPIRATION_MS + 1000).toISOString(),
      refreshedAt: now.toISOString(),
      refreshExpiresAtEstimate: null,
      generation: 1,
      state: "ready",
    };
    const perime: EnregistrementToken = { ...frais, expiresAt: new Date(now.getTime() + 1000).toISOString() };
    expect(estFrais(frais, now)).toBe(true);
    expect(estFrais(perime, now)).toBe(false);
  });

  it("DELAI_ABANDON_REFRESH_MS = 20000 (15s timeout + 5s marge)", () => {
    expect(DELAI_ABANDON_REFRESH_MS).toBe(20_000);
  });
});

describe("cycle.ts — rafraîchissement unique", () => {
  it("token ready et frais : aucun appel réseau, accessToken renvoyé tel quel", async () => {
    const dir = await creerRepertoireTemporaire();
    try {
      const clock = creerHorlogeControlee(DEPART);
      const stockage = construireDependancesStockage(dir, clock);
      const frais: EnregistrementToken = {
        accessToken: "access-frais",
        refreshToken: "refresh-frais",
        expiresAt: new Date(clock.now().getTime() + 3600_000).toISOString(),
        refreshedAt: clock.now().toISOString(),
        refreshExpiresAtEstimate: null,
        generation: 1,
        state: "ready",
      };
      await stockage.tokenStore.write(stockage.identite, frais);
      await seedGenerations(stockage, { schemaVersion: 1, derniereReservee: 1, revoqueeJusqua: 0 });
      const transport = creerTransportFactice([]);

      const resultat = await assurerTokenValide(
        { transport, clock, profilAuth: { clientId: "c" }, ...stockage },
        { budgetRestant: 30, deadline: new Date(clock.now().getTime() + 60_000) },
      );

      expect(resultat).toEqual({ accessToken: "access-frais", tentativesAuth: 0 });
      expect(transport.appels).toHaveLength(0);
    } finally {
      await nettoyerRepertoire(dir);
    }
  });

  it("token expiré : devient l'unique rafraîchisseur, un seul échange, nouvelle génération ready persistée", async () => {
    const dir = await creerRepertoireTemporaire();
    try {
      const clock = creerHorlogeControlee(DEPART);
      const stockage = construireDependancesStockage(dir, clock);
      await stockage.tokenStore.write(stockage.identite, enregistrementExpire(1, clock));
      await seedGenerations(stockage, { schemaVersion: 1, derniereReservee: 1, revoqueeJusqua: 0 });
      const transport = creerTransportFactice([
        reponseTokenValide({ access_token: "access-2", refresh_token: "refresh-2", expires_in: 3600 }),
      ]);

      const resultat = await assurerTokenValide(
        { transport, clock, profilAuth: { clientId: "c" }, ...stockage },
        { budgetRestant: 30, deadline: new Date(clock.now().getTime() + 60_000) },
      );

      expect(resultat).toEqual({ accessToken: "access-2", tentativesAuth: 1 });
      expect(transport.appels).toHaveLength(1);
      expect(transport.appels[0]!.champsCorps.grant_type).toBe("refresh_token");
      expect(transport.appels[0]!.champsCorps.refresh_token).toBe("ancien-refresh");

      const persiste = await stockage.tokenStore.read(stockage.identite);
      expect(persiste).toMatchObject({ accessToken: "access-2", refreshToken: "refresh-2", generation: 2, state: "ready" });
    } finally {
      await nettoyerRepertoire(dir);
    }
  });

  it("critère #7 : expires_in invalide lors d'un refresh ⇒ expiresAt = now + 300s", async () => {
    const dir = await creerRepertoireTemporaire();
    try {
      const clock = creerHorlogeControlee(DEPART);
      const stockage = construireDependancesStockage(dir, clock);
      await stockage.tokenStore.write(stockage.identite, enregistrementExpire(1, clock));
      await seedGenerations(stockage, { schemaVersion: 1, derniereReservee: 1, revoqueeJusqua: 0 });
      const transport = creerTransportFactice([reponseTokenValide({ expires_in: "pas-un-nombre" })]);

      await assurerTokenValide(
        { transport, clock, profilAuth: { clientId: "c" }, ...stockage },
        { budgetRestant: 30, deadline: new Date(clock.now().getTime() + 60_000) },
      );

      const persiste = await stockage.tokenStore.read(stockage.identite);
      expect(persiste!.expiresAt).toBe(new Date(clock.now().getTime() + 300_000).toISOString());
    } finally {
      await nettoyerRepertoire(dir);
    }
  });

  it("critère #6 (refresh) : réponse sans refresh_token ⇒ reauth_required persisté, AUTH_REQUIRED", async () => {
    const dir = await creerRepertoireTemporaire();
    try {
      const clock = creerHorlogeControlee(DEPART);
      const stockage = construireDependancesStockage(dir, clock);
      await stockage.tokenStore.write(stockage.identite, enregistrementExpire(1, clock));
      await seedGenerations(stockage, { schemaVersion: 1, derniereReservee: 1, revoqueeJusqua: 0 });
      const transport = creerTransportFactice([{ status: 200, corps: { access_token: "a2", expires_in: 3600 } }]);

      await expect(
        assurerTokenValide(
          { transport, clock, profilAuth: { clientId: "c" }, ...stockage },
          { budgetRestant: 30, deadline: new Date(clock.now().getTime() + 60_000) },
        ),
      ).rejects.toMatchObject({ erreur: { code: "AUTH_REQUIRED" } });

      const persiste = await stockage.tokenStore.read(stockage.identite);
      expect(persiste!.state).toBe("reauth_required");
      expect(persiste!.refreshToken).toBe("ancien-refresh"); // jamais rejoué, mais jamais effacé non plus
    } finally {
      await nettoyerRepertoire(dir);
    }
  });

  it("invalid_grant ⇒ reauth_required persisté, AUTH_REQUIRED (login requis)", async () => {
    const dir = await creerRepertoireTemporaire();
    try {
      const clock = creerHorlogeControlee(DEPART);
      const stockage = construireDependancesStockage(dir, clock);
      await stockage.tokenStore.write(stockage.identite, enregistrementExpire(1, clock));
      await seedGenerations(stockage, { schemaVersion: 1, derniereReservee: 1, revoqueeJusqua: 0 });
      const transport = creerTransportFactice([{ status: 400, corps: { error: "invalid_grant" } }]);

      await expect(
        assurerTokenValide(
          { transport, clock, profilAuth: { clientId: "c" }, ...stockage },
          { budgetRestant: 30, deadline: new Date(clock.now().getTime() + 60_000) },
        ),
      ).rejects.toMatchObject({ erreur: { code: "AUTH_REQUIRED" } });

      expect((await stockage.tokenStore.read(stockage.identite))!.state).toBe("reauth_required");
    } finally {
      await nettoyerRepertoire(dir);
    }
  });

  it("critère #9 : marqueur refreshing abandonné (au-delà de DELAI_ABANDON_REFRESH_MS) ⇒ reauth_required, aucun rejeu", async () => {
    const dir = await creerRepertoireTemporaire();
    try {
      const clock = creerHorlogeControlee(DEPART);
      const stockage = construireDependancesStockage(dir, clock);
      const marqueur: EnregistrementToken = {
        accessToken: "access-perime",
        refreshToken: "refresh-jamais-a-rejouer",
        expiresAt: new Date(clock.now().getTime() - 1000).toISOString(),
        refreshedAt: clock.now().toISOString(),
        refreshExpiresAtEstimate: null,
        generation: 1,
        state: "refreshing",
      };
      await stockage.tokenStore.write(stockage.identite, marqueur);
      await seedGenerations(stockage, { schemaVersion: 1, derniereReservee: 1, revoqueeJusqua: 0 });
      clock.avancer(DELAI_ABANDON_REFRESH_MS);
      const transport = creerTransportFactice([]);

      await expect(
        assurerTokenValide(
          { transport, clock, profilAuth: { clientId: "c" }, ...stockage },
          { budgetRestant: 30, deadline: new Date(clock.now().getTime() + 60_000) },
        ),
      ).rejects.toMatchObject({ erreur: { code: "AUTH_REQUIRED" } });

      expect(transport.appels).toHaveLength(0);
      const persiste = await stockage.tokenStore.read(stockage.identite);
      expect(persiste!.state).toBe("reauth_required");
      expect(persiste!.refreshToken).toBe("refresh-jamais-a-rejouer");
    } finally {
      await nettoyerRepertoire(dir);
    }
  });

  it("critère #10 : l'ordre est prouvé — écriture refreshing, échange réseau, écriture ready, puis résolution", async () => {
    const dir = await creerRepertoireTemporaire();
    try {
      const clock = creerHorlogeControlee(DEPART);
      const stockage = construireDependancesStockage(dir, clock);
      await stockage.tokenStore.write(stockage.identite, enregistrementExpire(1, clock));
      await seedGenerations(stockage, { schemaVersion: 1, derniereReservee: 1, revoqueeJusqua: 0 });

      const sequence: string[] = [];
      const tokenStoreInstrumente = {
        ...stockage.tokenStore,
        async write(identite: unknown, enregistrement: EnregistrementToken) {
          sequence.push(`write:${enregistrement.state}`);
          await stockage.tokenStore.write(identite as never, enregistrement);
        },
      };
      const transportBase = creerTransportFactice([reponseTokenValide()]);
      const transportInstrumente = {
        appels: transportBase.appels,
        async request(spec: HttpRequestSpec) {
          sequence.push("network");
          return transportBase.request(spec);
        },
      };

      const resultat = await assurerTokenValide(
        { transport: transportInstrumente, clock, profilAuth: { clientId: "c" }, ...stockage, tokenStore: tokenStoreInstrumente },
        { budgetRestant: 30, deadline: new Date(clock.now().getTime() + 60_000) },
      );
      sequence.push("resolu");

      expect(sequence).toEqual(["write:refreshing", "network", "write:ready", "resolu"]);
      expect(resultat.accessToken).not.toBe("ancien-access");
    } finally {
      await nettoyerRepertoire(dir);
    }
  });

  it("observateur intra-processus (complète le critère #8 testé en multi-processus) : un refresh en cours n'est jamais rejoué", async () => {
    const dir = await creerRepertoireTemporaire();
    try {
      const clock = creerHorlogeControlee(DEPART);
      const stockage = construireDependancesStockage(dir, clock);
      const enCours: EnregistrementToken = {
        accessToken: "access-en-cours",
        refreshToken: "refresh-en-cours",
        expiresAt: new Date(clock.now().getTime() - 1000).toISOString(),
        refreshedAt: clock.now().toISOString(),
        refreshExpiresAtEstimate: null,
        generation: 1,
        state: "refreshing",
      };
      await stockage.tokenStore.write(stockage.identite, enCours);
      await seedGenerations(stockage, { schemaVersion: 1, derniereReservee: 1, revoqueeJusqua: 0 });
      const transport = creerTransportFactice([]);

      const observateur = assurerTokenValide(
        { transport, clock, profilAuth: { clientId: "c" }, ...stockage },
        { budgetRestant: 30, deadline: new Date(clock.now().getTime() + 30_000) },
      );

      // Laisse l'observateur entrer dans sa boucle d'attente (clock.wait réellement enregistrée).
      await new Promise((resolve) => setTimeout(resolve, 10));
      const nouveau: EnregistrementToken = {
        accessToken: "access-par-un-autre-processus",
        refreshToken: "refresh-par-un-autre-processus",
        expiresAt: new Date(clock.now().getTime() + 3600_000).toISOString(),
        refreshedAt: clock.now().toISOString(),
        refreshExpiresAtEstimate: null,
        generation: 2,
        state: "ready",
      };
      await stockage.tokenStore.write(stockage.identite, nouveau);
      clock.avancer(100);

      const resultat = await observateur;
      expect(resultat).toEqual({ accessToken: "access-par-un-autre-processus", tentativesAuth: 0 });
      expect(transport.appels).toHaveLength(0);
    } finally {
      await nettoyerRepertoire(dir);
    }
  });
});
