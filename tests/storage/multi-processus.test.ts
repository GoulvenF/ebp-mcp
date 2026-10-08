import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { creerGestionnaireVerrous, creerOperationsFichierNode, creerStoreJson } from "../../dist/index.js";
import { creerHorlogeReelle, creerRepertoireTemporaire, nettoyerRepertoire } from "./fixtures.js";

const ICI = dirname(fileURLToPath(import.meta.url));
const SCRIPT_ENFANT = join(ICI, "enfant-compteur.mjs");
const SCRIPT_RACE = join(ICI, "enfant-race.mjs");

function lancerScript(script: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const enfant = spawn(process.execPath, [script, ...args], { stdio: ["ignore", "pipe", "pipe"] });
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

async function attendre(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

describe("multi-processus.ts", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await creerRepertoireTemporaire();
  });

  afterEach(async () => {
    await nettoyerRepertoire(dir);
  });

  it(
    "4 processus enfants × 25 cycles sur le même compteur ⇒ exactement 100, aucun JSON invalide lu par le parent",
    async () => {
      const cheminCompteur = join(dir, "compteur.json");

      let enLecture = true;
      const anomalies: string[] = [];
      const lectureConcurrente = (async () => {
        while (enLecture) {
          try {
            const contenu = await readFile(cheminCompteur, "utf8");
            JSON.parse(contenu);
          } catch (erreur) {
            if (!(erreur instanceof Error) || (erreur as NodeJS.ErrnoException).code !== "ENOENT") {
              if (erreur instanceof SyntaxError) {
                anomalies.push(String(erreur.message));
              }
            }
          }
          await attendre(2);
        }
      })();

      const enfants = Array.from({ length: 4 }, () =>
        lancerScript(SCRIPT_ENFANT, [dir, cheminCompteur, "cycles:25"]),
      );
      await Promise.all(enfants);

      enLecture = false;
      await lectureConcurrente;

      expect(anomalies).toEqual([]);
      const contenuFinal = JSON.parse(await readFile(cheminCompteur, "utf8")) as { data: { valeur: number } };
      expect(contenuFinal.data.valeur).toBe(100);
    },
    25000,
  );

  it(
    "un enfant SIGKILLé en détenant le verrou ⇒ le parent récupère après mort prouvée",
    { timeout: 25000, retry: 2 },
    async () => {
      const cheminCompteur = join(dir, "compteur-kill.json");
      const cheminMarqueur = join(dir, "marqueur.pid");

      const enfant = spawn(process.execPath, [SCRIPT_ENFANT, dir, cheminCompteur, "retenir", cheminMarqueur], {
        stdio: ["ignore", "ignore", "pipe"],
      });

      const debut = Date.now();
      while (true) {
        try {
          await readFile(cheminMarqueur, "utf8");
          break;
        } catch {
          if (Date.now() - debut > 10000) {
            throw new Error("L'enfant n'a jamais signalé la détention du verrou.");
          }
          await attendre(10);
        }
      }

      enfant.kill("SIGKILL");
      await new Promise((resolve) => enfant.on("exit", resolve));

      const operations = creerOperationsFichierNode();
      const verrous = creerGestionnaireVerrous({ repertoire: dir, operations, clock: creerHorlogeReelle() });
      const store = creerStoreJson({ operations });

      const verrou = await verrous.acquire("quota", new Date(Date.now() + 15000));
      try {
        const etatDurable = await store.lire<{ valeur: number }>(cheminCompteur, "compteur");
        expect(etatDurable).toEqual({ valeur: 1 });
        await store.ecrire(cheminCompteur, "compteur", { valeur: etatDurable!.valeur + 1 });
      } finally {
        await verrou.release();
      }

      const etatFinal = await store.lire<{ valeur: number }>(cheminCompteur, "compteur");
      expect(etatFinal).toEqual({ valeur: 2 });
    },
  );

  it(
    "deux prétendants réels récupérant un verrou mort prouvé ne le détiennent jamais simultanément (revue T04, point 1)",
    { timeout: 25000, retry: 2 },
    async () => {
      const cheminCompteur = join(dir, "compteur-race.json");
      const cheminMarqueur = join(dir, "marqueur-race.pid");
      const cheminOccupation = join(dir, "occupation");
      const cheminResultatA = join(dir, "resultat-A");
      const cheminResultatB = join(dir, "resultat-B");
      await writeFile(cheminOccupation, "", "utf8");

      const detenteur = spawn(process.execPath, [SCRIPT_ENFANT, dir, cheminCompteur, "retenir", cheminMarqueur], {
        stdio: ["ignore", "ignore", "pipe"],
      });

      const debut = Date.now();
      while (true) {
        try {
          await readFile(cheminMarqueur, "utf8");
          break;
        } catch {
          if (Date.now() - debut > 10000) {
            throw new Error("L'enfant n'a jamais signalé la détention du verrou.");
          }
          await attendre(10);
        }
      }

      detenteur.kill("SIGKILL");
      await new Promise((resolve) => detenteur.on("exit", resolve));

      await Promise.all([
        lancerScript(SCRIPT_RACE, [dir, "A", cheminOccupation, cheminResultatA]),
        lancerScript(SCRIPT_RACE, [dir, "B", cheminOccupation, cheminResultatB]),
      ]);

      const resultatA = await readFile(cheminResultatA, "utf8");
      const resultatB = await readFile(cheminResultatB, "utf8");
      expect(resultatA).not.toContain("COLLISION");
      expect(resultatB).not.toContain("COLLISION");
    },
  );
});
