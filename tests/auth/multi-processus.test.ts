import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { creerOperationsFichierNode, creerStoreJson, creerTokenStoreFichier } from "../../dist/index.js";
import type { EnregistrementToken, EtatGenerations } from "../../dist/index.js";
import { creerRepertoireTemporaire, identiteTest, nettoyerRepertoire } from "./fixtures.js";

const ICI = dirname(fileURLToPath(import.meta.url));
const SCRIPT_ENFANT = join(ICI, "enfant-refresh.mjs");

function lancerScript(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const enfant = spawn(process.execPath, [SCRIPT_ENFANT, ...args], { stdio: ["ignore", "pipe", "pipe"] });
    let erreurSortie = "";
    enfant.stderr.on("data", (donnees: Buffer) => {
      erreurSortie += donnees.toString();
    });
    enfant.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Enfant terminé avec le code ${code} : ${erreurSortie}`));
    });
    enfant.on("error", reject);
  });
}

describe("auth/multi-processus (critère #8)", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await creerRepertoireTemporaire();
  });

  afterEach(async () => {
    await nettoyerRepertoire(dir);
  });

  it(
    "4 processus enfants réels, token expiré partagé ⇒ exactement un échange réseau, même génération ready pour tous",
    async () => {
      const identite = identiteTest();
      const operations = creerOperationsFichierNode();
      const store = creerStoreJson({ operations });
      const cheminGenerations = join(dir, "generations.json");
      const cheminTokens = join(dir, "tokens.json");
      const tokenStore = creerTokenStoreFichier({ chemin: cheminTokens, store, operations });
      const cheminLogEchanges = join(dir, "echanges.log");
      const cheminsResultats = Array.from({ length: 4 }, (_, i) => join(dir, `resultat-${i}.json`));

      const expireLe = new Date(Date.now() - 1000).toISOString();
      const enregistrementExpire: EnregistrementToken = {
        accessToken: "ancien-access-partage",
        refreshToken: "ancien-refresh-partage",
        expiresAt: expireLe,
        refreshedAt: new Date(Date.now() - 3600_000).toISOString(),
        refreshExpiresAtEstimate: null,
        generation: 1,
        state: "ready",
      };
      await tokenStore.write(identite, enregistrementExpire);
      await store.ecrire(cheminGenerations, "auth-generations", {
        schemaVersion: 1,
        derniereReservee: 1,
        revoqueeJusqua: 0,
      } satisfies EtatGenerations);

      await Promise.all(
        cheminsResultats.map((cheminResultat) => lancerScript([dir, cheminLogEchanges, cheminResultat])),
      );

      const lignesEchanges = (await readFile(cheminLogEchanges, "utf8")).trim().split("\n").filter(Boolean);
      expect(lignesEchanges).toHaveLength(1);

      const resultats = await Promise.all(
        cheminsResultats.map(async (chemin) => JSON.parse(await readFile(chemin, "utf8")) as { accessToken: string; generation: number; state: string }),
      );
      for (const resultat of resultats) {
        expect(resultat.state).toBe("ready");
        expect(resultat.generation).toBe(2);
        expect(resultat.accessToken).toBe(resultats[0]!.accessToken);
        expect(resultat.accessToken).not.toBe("ancien-access-partage");
      }
    },
    25000,
  );
});
