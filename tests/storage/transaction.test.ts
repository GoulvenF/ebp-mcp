import { describe, expect, it } from "vitest";
import { mettreAJourSousVerrou } from "../../dist/index.js";
import type { Lock, LockManager, StoreJson } from "../../dist/index.js";

function verrouFactice(release: () => Promise<void>): LockManager {
  let libere = false;
  const lock: Lock = {
    async release() {
      if (libere) return;
      libere = true;
      await release();
    },
  };
  return {
    async acquire() {
      return lock;
    },
  };
}

function storeFactice(ecrire: (valeur: unknown) => Promise<void>): StoreJson {
  return {
    async lire() {
      return null;
    },
    async ecrire(_chemin, _type, valeur) {
      await ecrire(valeur);
    },
  };
}

describe("transaction.ts", () => {
  it("l'échec du corps est propagé même si release() échoue aussi", async () => {
    const erreurCorps = new Error("échec du corps");
    const releaseAppele = { valeur: false };
    const verrous = verrouFactice(async () => {
      releaseAppele.valeur = true;
      throw new Error("échec de release");
    });
    const store = storeFactice(async () => undefined);
    const avertissements: string[] = [];

    await expect(
      mettreAJourSousVerrou(
        {
          verrous,
          store,
          nomVerrou: "quota",
          chemin: "/tmp/inutilise.json",
          type: "quota",
          deadline: new Date(Date.now() + 1000),
          journal: { avertir: (message) => avertissements.push(message) },
        },
        () => {
          throw erreurCorps;
        },
      ),
    ).rejects.toBe(erreurCorps);

    expect(releaseAppele.valeur).toBe(true);
    expect(avertissements).toHaveLength(1);
  });

  it("un corps réussi mais un release() en échec propage l'erreur de release()", async () => {
    const verrous = verrouFactice(async () => {
      throw new Error("échec de release après succès");
    });
    const store = storeFactice(async () => undefined);

    await expect(
      mettreAJourSousVerrou(
        {
          verrous,
          store,
          nomVerrou: "quota",
          chemin: "/tmp/inutilise.json",
          type: "quota",
          deadline: new Date(Date.now() + 1000),
        },
        () => "valeur",
      ),
    ).rejects.toThrow("échec de release après succès");
  });

  it("corps et release() réussis ⇒ la valeur transformée est retournée", async () => {
    const verrous = verrouFactice(async () => undefined);
    const valeursEcrites: unknown[] = [];
    const store = storeFactice(async (valeur) => {
      valeursEcrites.push(valeur);
    });

    const resultat = await mettreAJourSousVerrou(
      {
        verrous,
        store,
        nomVerrou: "quota",
        chemin: "/tmp/inutilise.json",
        type: "quota",
        deadline: new Date(Date.now() + 1000),
      },
      (actuelle) => (actuelle === null ? "premiere" : "autre"),
    );

    expect(resultat).toBe("premiere");
    expect(valeursEcrites).toEqual(["premiere"]);
  });
});
