import { describe, expect, it } from "vitest";
import { logout } from "../../dist/index.js";
import type { EnregistrementToken, EtatGenerations } from "../../dist/index.js";
import { construireDependancesStockage, creerHorlogeControlee, creerRepertoireTemporaire, nettoyerRepertoire } from "./fixtures.js";

describe("logout.ts", () => {
  it("idempotent sans tokens existants : succès silencieux", async () => {
    const dir = await creerRepertoireTemporaire();
    try {
      const clock = creerHorlogeControlee(new Date());
      const stockage = construireDependancesStockage(dir, clock);

      await expect(
        logout(
          { verrous: stockage.verrous, store: stockage.store, tokenStore: stockage.tokenStore, identite: stockage.identite, nomVerrou: stockage.nomVerrou, cheminGenerations: stockage.cheminGenerations },
          { deadline: new Date(clock.now().getTime() + 10_000) },
        ),
      ).resolves.toBeUndefined();

      const generations = await stockage.store.lire<EtatGenerations>(stockage.cheminGenerations, "auth-generations");
      expect(generations).toEqual({ schemaVersion: 1, derniereReservee: 0, revoqueeJusqua: 0 });
    } finally {
      await nettoyerRepertoire(dir);
    }
  });

  it("révoque la génération courante et efface les tokens persistés ; le fichier generations.json survit", async () => {
    const dir = await creerRepertoireTemporaire();
    try {
      const clock = creerHorlogeControlee(new Date());
      const stockage = construireDependancesStockage(dir, clock);
      const enregistrement: EnregistrementToken = {
        accessToken: "a",
        refreshToken: "r",
        expiresAt: new Date(clock.now().getTime() + 3600_000).toISOString(),
        refreshedAt: clock.now().toISOString(),
        refreshExpiresAtEstimate: null,
        generation: 3,
        state: "ready",
      };
      await stockage.tokenStore.write(stockage.identite, enregistrement);
      await stockage.store.ecrire(stockage.cheminGenerations, "auth-generations", {
        schemaVersion: 1,
        derniereReservee: 3,
        revoqueeJusqua: 0,
      } satisfies EtatGenerations);

      await logout(
        { verrous: stockage.verrous, store: stockage.store, tokenStore: stockage.tokenStore, identite: stockage.identite, nomVerrou: stockage.nomVerrou, cheminGenerations: stockage.cheminGenerations },
        { deadline: new Date(clock.now().getTime() + 10_000) },
      );

      expect(await stockage.tokenStore.read(stockage.identite)).toBeNull();
      const generations = await stockage.store.lire<EtatGenerations>(stockage.cheminGenerations, "auth-generations");
      expect(generations).toEqual({ schemaVersion: 1, derniereReservee: 3, revoqueeJusqua: 3 });
    } finally {
      await nettoyerRepertoire(dir);
    }
  });
});
