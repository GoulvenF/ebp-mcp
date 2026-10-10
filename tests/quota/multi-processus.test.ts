import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { creerRepertoireTemporaire, nettoyerRepertoire } from "./fixtures.js";

const ICI = dirname(fileURLToPath(import.meta.url));
const SCRIPT_ENFANT = join(ICI, "enfant-depart.mjs");
const MIN_INTERVAL_MS = 1000;
const NOMBRE_DEPARTS = 3;

function lancerScript(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const enfant = spawn(process.execPath, [SCRIPT_ENFANT, ...args], { stdio: ["ignore", "pipe", "pipe"] });
    let erreurSortie = "";
    enfant.stderr.on("data", (donnees: Buffer) => {
      erreurSortie += donnees.toString();
    });
    enfant.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Enfant terminé avec le code ${code} : ${erreurSortie}`));
      }
    });
    enfant.on("error", reject);
  });
}

describe("quota multi-processus (critère 1, 07 §4)", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await creerRepertoireTemporaire();
  });

  afterEach(async () => {
    await nettoyerRepertoire(dir);
  });

  it(
    "deux processus enfants, profils différents, même groupe, minIntervalMs=1000 ⇒ aucun couple de départs à moins de 1000 ms",
    async () => {
      const groupe = "partage";
      const sortieA = join(dir, "instants-a.txt");
      const sortieB = join(dir, "instants-b.txt");

      await Promise.all([
        lancerScript([dir, groupe, "10000", "500", String(MIN_INTERVAL_MS), String(NOMBRE_DEPARTS), sortieA]),
        lancerScript([dir, groupe, "10000", "500", String(MIN_INTERVAL_MS), String(NOMBRE_DEPARTS), sortieB]),
      ]);

      const instants = [
        ...(await readFile(sortieA, "utf8")).trim().split("\n").map(Number),
        ...(await readFile(sortieB, "utf8")).trim().split("\n").map(Number),
      ].sort((a, b) => a - b);

      expect(instants).toHaveLength(NOMBRE_DEPARTS * 2);
      for (let i = 1; i < instants.length; i += 1) {
        const ecart = (instants[i] as number) - (instants[i - 1] as number);
        // Instants journalisés par le processus enfant à l'écriture de `dernierDepart`, sous
        // verrou (décider, src/quota/quota-store-fichier.ts), avant fsync + release() : c'est
        // l'espacement que l'implémentation garantit réellement, pas le wall-clock post-retour
        // (qui inclut un coût variable d'E/S et rendait l'assertion bruitée). Exacte, sans
        // tolérance.
        expect(ecart).toBeGreaterThanOrEqual(MIN_INTERVAL_MS);
      }
    },
    MIN_INTERVAL_MS * (NOMBRE_DEPARTS * 2 + 5) * 2,
  );
});
