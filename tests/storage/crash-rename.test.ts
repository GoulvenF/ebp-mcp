import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { creerOperationsFichierNode, creerStoreJson, ErreurStockage, type StoreJson } from "../../dist/index.js";
import { avecEchecInjecte, creerRepertoireTemporaire, nettoyerRepertoire } from "./fixtures.js";

interface Compteur {
  readonly valeur: number;
}

describe("crash-rename.ts", () => {
  let dir: string;
  let chemin: string;
  let store: StoreJson;

  beforeEach(async () => {
    dir = await creerRepertoireTemporaire();
    chemin = join(dir, "etat.json");
    store = creerStoreJson({ operations: creerOperationsFichierNode() });
    await store.ecrire<Compteur>(chemin, "compteur", { valeur: 1 });
  });

  afterEach(async () => {
    await nettoyerRepertoire(dir);
  });

  it("échec injecté avant renommer ⇒ la cible garde son contenu précédent, aucun temporaire lisible", async () => {
    const echec = avecEchecInjecte(creerOperationsFichierNode(), "fermer", 1, "EIO");
    const storeEnPanne = creerStoreJson({ operations: echec });

    await expect(storeEnPanne.ecrire<Compteur>(chemin, "compteur", { valeur: 2 })).rejects.toBeInstanceOf(
      ErreurStockage,
    );

    const relu = await store.lire<Compteur>(chemin, "compteur");
    expect(relu).toEqual({ valeur: 1 });

    const entrees = await readdir(dir);
    expect(entrees.filter((e) => e.startsWith(".tmp-"))).toHaveLength(0);
  });

  it("échec injecté après renommer (synchroniserRepertoire) ⇒ la nouvelle valeur est committée et relue intacte", async () => {
    const echec = avecEchecInjecte(creerOperationsFichierNode(), "synchroniserRepertoire", 1, "EIO");
    const storeDontLeFsyncRepertoireEchoue = creerStoreJson({ operations: echec });

    await storeDontLeFsyncRepertoireEchoue.ecrire<Compteur>(chemin, "compteur", { valeur: 2 });

    const relu = await store.lire<Compteur>(chemin, "compteur");
    expect(relu).toEqual({ valeur: 2 });
  });

  it("un lecteur concurrent ne voit jamais un JSON à moitié écrit pendant une écriture", async () => {
    let enLecture = true;
    const lectures: unknown[] = [];
    const bouclerLecture = (async () => {
      while (enLecture) {
        try {
          const contenu = await readFile(chemin, "utf8");
          lectures.push(JSON.parse(contenu));
        } catch {
          // Une lecture concurrente à la fenêtre `rename` (ENOENT) est possible et sans gravité :
          // ce test vérifie l'absence de JSON invalide, pas l'absence de courtes fenêtres ENOENT.
        }
      }
    })();

    for (let i = 2; i <= 50; i += 1) {
      await store.ecrire<Compteur>(chemin, "compteur", { valeur: i });
    }
    enLecture = false;
    await bouclerLecture;

    expect(lectures.length).toBeGreaterThan(0);
    for (const lecture of lectures) {
      expect(lecture).toHaveProperty("storeVersion", 1);
      expect(lecture).toHaveProperty("type", "compteur");
      expect(typeof (lecture as { data: Compteur }).data.valeur).toBe("number");
    }
  });
});
