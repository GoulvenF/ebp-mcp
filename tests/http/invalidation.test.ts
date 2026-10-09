import { describe, expect, it } from "vitest";
import { invaliderAccessToken } from "../../dist/index.js";
import type { EnregistrementToken } from "../../dist/index.js";
import { construireDependancesStockage, creerHorlogeControlee, creerRepertoireTemporaire, nettoyerRepertoire } from "../auth/fixtures.js";

const DEPART = new Date("2026-01-01T00:00:00.000Z");

function enregistrementReady(generation: number): EnregistrementToken {
  return {
    accessToken: "access-rejete",
    refreshToken: "refresh-1",
    expiresAt: new Date(DEPART.getTime() + 3600_000).toISOString(),
    refreshedAt: DEPART.toISOString(),
    refreshExpiresAtEstimate: null,
    generation,
    state: "ready",
  };
}

describe("cycle.ts — invaliderAccessToken (décision 12)", () => {
  it("génération correspondante et état ready : expiresAt ramené à now (force le refresh suivant)", async () => {
    const dir = await creerRepertoireTemporaire();
    try {
      const clock = creerHorlogeControlee(DEPART);
      const stockage = construireDependancesStockage(dir, clock);
      await stockage.tokenStore.write(stockage.identite, enregistrementReady(1));

      await invaliderAccessToken({ transport: undefined as never, clock, profilAuth: { clientId: "c" }, ...stockage }, 1);

      const releve = await stockage.tokenStore.read(stockage.identite);
      expect(releve!.expiresAt).toBe(clock.now().toISOString());
      expect(releve!.state).toBe("ready");
    } finally {
      await nettoyerRepertoire(dir);
    }
  });

  it("génération déjà avancée : n'écrit rien", async () => {
    const dir = await creerRepertoireTemporaire();
    try {
      const clock = creerHorlogeControlee(DEPART);
      const stockage = construireDependancesStockage(dir, clock);
      const actuel = enregistrementReady(2);
      await stockage.tokenStore.write(stockage.identite, actuel);

      await invaliderAccessToken({ transport: undefined as never, clock, profilAuth: { clientId: "c" }, ...stockage }, 1);

      const releve = await stockage.tokenStore.read(stockage.identite);
      expect(releve).toEqual(actuel);
    } finally {
      await nettoyerRepertoire(dir);
    }
  });

  it("état refreshing (pas ready) : n'écrit rien, pas de passage par reauth_required", async () => {
    const dir = await creerRepertoireTemporaire();
    try {
      const clock = creerHorlogeControlee(DEPART);
      const stockage = construireDependancesStockage(dir, clock);
      const actuel: EnregistrementToken = { ...enregistrementReady(1), state: "refreshing" };
      await stockage.tokenStore.write(stockage.identite, actuel);

      await invaliderAccessToken({ transport: undefined as never, clock, profilAuth: { clientId: "c" }, ...stockage }, 1);

      const releve = await stockage.tokenStore.read(stockage.identite);
      expect(releve).toEqual(actuel);
    } finally {
      await nettoyerRepertoire(dir);
    }
  });
});
