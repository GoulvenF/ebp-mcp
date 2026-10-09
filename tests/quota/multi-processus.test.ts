import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { creerRepertoireTemporaire, nettoyerRepertoire } from "./fixtures.js";

const ICI = dirname(fileURLToPath(import.meta.url));
const SCRIPT_ENFANT = join(ICI, "enfant-depart.mjs");

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
      const nombreDeparts = 3;

      await Promise.all([
        lancerScript([dir, groupe, "10000", "500", "1000", String(nombreDeparts), sortieA]),
        lancerScript([dir, groupe, "10000", "500", "1000", String(nombreDeparts), sortieB]),
      ]);

      const instants = [
        ...(await readFile(sortieA, "utf8")).trim().split("\n").map(Number),
        ...(await readFile(sortieB, "utf8")).trim().split("\n").map(Number),
      ].sort((a, b) => a - b);

      expect(instants).toHaveLength(nombreDeparts * 2);
      for (let i = 1; i < instants.length; i += 1) {
        const ecart = (instants[i] as number) - (instants[i - 1] as number);
        // Tolérance de 5 % : horloge réelle inter-processus sous une CI chargée (plusieurs
        // fichiers de test tournent en parallèle) ; la garantie testée ici est l'absence de
        // rafale (un écart proche de 0 trahirait un vrai bug), pas la précision du minuteur OS.
        expect(ecart).toBeGreaterThanOrEqual(950);
      }
    },
    30000,
  );
});
