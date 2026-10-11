import { describe, expect, it } from "vitest";
import { statutContexte } from "../../../dist/index.js";
import { aliasDe, configDe, creerQuotaStoreFactice, creerTokenStoreFactice } from "./fixtures.js";

describe("statutContexte (D-T12-11)", () => {
  it("0 appel transport : dépendances strictement locales (TokenStore/QuotaStore en mémoire)", async () => {
    const config = configDe();
    const tokenStore = creerTokenStoreFactice();
    const quotaStore = creerQuotaStoreFactice();

    const resultat = await statutContexte({ tokenStore, quotaStore }, config, "mock", null);

    expect(tokenStore.appelsLecture).toBe(1);
    expect(resultat.mode).toBe("mock");
    expect(resultat.profil).toBe("default");
  });

  it("aucun token, client secret ni clé d'abonnement dans la sortie", async () => {
    const config = configDe();
    const tokenStore = creerTokenStoreFactice({
      accessToken: "acces-secret",
      refreshToken: "refresh-secret",
      expiresAt: new Date().toISOString(),
      refreshedAt: new Date().toISOString(),
      refreshExpiresAtEstimate: null,
      generation: 1,
      state: "ready",
    });
    const quotaStore = creerQuotaStoreFactice();

    const resultat = await statutContexte({ tokenStore, quotaStore }, config, "mock", null);
    const serialise = JSON.stringify(resultat);

    expect(serialise).not.toContain("acces-secret");
    expect(serialise).not.toContain("refresh-secret");
    expect(serialise).not.toContain("secret-ne-doit-jamais-sortir");
    expect(serialise).not.toContain("cle-abonnement-secrete");
    expect(resultat.auth).not.toHaveProperty("accessToken");
    expect(resultat.auth).not.toHaveProperty("refreshToken");
  });

  it("groupe de quota partagé par deux familles actives ⇒ listé une seule fois", async () => {
    const config = configDe(); // hubbix-compta et hubbix-gescom actifs, même quotaGroup "grp"
    const tokenStore = creerTokenStoreFactice();
    const quotaStore = creerQuotaStoreFactice();

    const resultat = await statutContexte({ tokenStore, quotaStore }, config, "mock", null);

    expect(resultat.quota).toHaveLength(1);
    expect(resultat.quota[0]).toMatchObject({
      groupe: "grp",
      quota_jour_restant: 9000,
      quota_utilisable: 8500,
      quota_estime: true,
      max_par_jour: 10000,
      reserve: 500,
    });
    expect(quotaStore.groupesInterroges).toEqual(["grp"]);
  });

  it("dossier_actif suit l'alias de session, sinon le défaut de l'environnement", async () => {
    const config = configDe();
    const tokenStore = creerTokenStoreFactice();
    const quotaStore = creerQuotaStoreFactice();

    const sansSession = await statutContexte({ tokenStore, quotaStore }, config, "mock", null);
    expect(sansSession.dossier_actif).toBe("dossier-cpt");

    const avecSession = await statutContexte({ tokenStore, quotaStore }, config, "mock", aliasDe("dossier-gc"));
    expect(avecSession.dossier_actif).toBe("dossier-gc");
  });
});
