import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { creerGestionnaireVerrous, creerOperationsFichierNode, ErreurStockage } from "../../dist/index.js";
import { creerHorlogeReelle, creerRepertoireTemporaire, nettoyerRepertoire } from "./fixtures.js";

function pidTermine(): number {
  const resultat = spawnSync(process.execPath, ["-e", "process.exit(0)"]);
  const pid = resultat.pid;
  if (pid === undefined) {
    throw new Error("Impossible d'obtenir un pid de processus terminé pour le test.");
  }
  return pid;
}

describe("verrou.ts", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await creerRepertoireTemporaire();
  });

  afterEach(async () => {
    await nettoyerRepertoire(dir);
  });

  function gestionnaire() {
    return creerGestionnaireVerrous({ repertoire: dir, operations: creerOperationsFichierNode(), clock: creerHorlogeReelle() });
  }

  it("exclusivité : un second acquire échoue sur deadline tant que le premier est détenu", async () => {
    const verrous = gestionnaire();
    const lock1 = await verrous.acquire("auth", new Date(Date.now() + 1000));

    await expect(verrous.acquire("auth", new Date(Date.now() + 150))).rejects.toMatchObject({
      erreur: { code: "AUTH_STORAGE_FAILED", details: { raison: "deadline" } },
    });

    await lock1.release();
  });

  it("second acquire servi après release", async () => {
    const verrous = gestionnaire();
    const lock1 = await verrous.acquire("auth", new Date(Date.now() + 1000));
    const acquisitionSuivante = verrous.acquire("auth", new Date(Date.now() + 2000));
    await lock1.release();
    const lock2 = await acquisitionSuivante;
    expect(lock2).toBeDefined();
    await lock2.release();
  });

  it("deadline déjà dépassée ⇒ erreur bornée", async () => {
    const verrous = gestionnaire();
    const lock1 = await verrous.acquire("auth", new Date(Date.now() + 1000));
    const debut = Date.now();
    await expect(verrous.acquire("auth", new Date(Date.now() + 50))).rejects.toBeInstanceOf(ErreurStockage);
    expect(Date.now() - debut).toBeLessThan(2000);
    await lock1.release();
  });

  it("signal déjà déclenché ⇒ erreur immédiate", async () => {
    const verrous = gestionnaire();
    const controleur = new AbortController();
    controleur.abort();
    await expect(
      verrous.acquire("auth", new Date(Date.now() + 1000), controleur.signal),
    ).rejects.toMatchObject({ erreur: { details: { raison: "signal" } } });
  });

  it("verrou d'un pid vivant (le nôtre) avec acquisLe très ancien ⇒ jamais volé, échec sur deadline", async () => {
    const chemin = join(dir, "auth.lock");
    await writeFile(
      chemin,
      JSON.stringify({ pid: process.pid, hostname: hostname(), acquisLe: "2000-01-01T00:00:00.000Z", jeton: "ancien" }),
      "utf8",
    );

    const verrous = gestionnaire();
    await expect(verrous.acquire("auth", new Date(Date.now() + 150))).rejects.toMatchObject({
      erreur: { code: "AUTH_STORAGE_FAILED", details: { raison: "deadline" } },
    });

    const contenuInchange = await readFile(chemin, "utf8");
    expect(JSON.parse(contenuInchange).jeton).toBe("ancien");
  });

  it("verrou d'un pid mort prouvé ⇒ récupéré", async () => {
    const chemin = join(dir, "auth.lock");
    const pidMort = pidTermine();
    await writeFile(
      chemin,
      JSON.stringify({ pid: pidMort, hostname: hostname(), acquisLe: new Date().toISOString(), jeton: "mort" }),
      "utf8",
    );

    const verrous = gestionnaire();
    const lock = await verrous.acquire("auth", new Date(Date.now() + 2000));
    const contenu = JSON.parse(await readFile(chemin, "utf8"));
    expect(contenu.jeton).not.toBe("mort");
    expect(contenu.pid).toBe(process.pid);
    await lock.release();
  });

  it("hostname étranger ⇒ jamais volé, erreur explicite", async () => {
    const chemin = join(dir, "auth.lock");
    await writeFile(
      chemin,
      JSON.stringify({ pid: 1, hostname: "hote-etranger", acquisLe: new Date().toISOString(), jeton: "x" }),
      "utf8",
    );

    const verrous = gestionnaire();
    const debut = Date.now();
    await expect(verrous.acquire("auth", new Date(Date.now() + 2000))).rejects.toMatchObject({
      erreur: { code: "AUTH_STORAGE_FAILED", details: { hoteDistant: "hote-etranger" } },
    });
    expect(Date.now() - debut).toBeLessThan(500);
  });

  it("release() d'un propriétaire remplacé ne supprime pas le fichier du nouveau propriétaire", async () => {
    const chemin = join(dir, "auth.lock");
    const verrous = gestionnaire();
    const lock = await verrous.acquire("auth", new Date(Date.now() + 1000));

    await writeFile(
      chemin,
      JSON.stringify({ pid: process.pid, hostname: hostname(), acquisLe: new Date().toISOString(), jeton: "nouveau-proprietaire" }),
      "utf8",
    );

    await lock.release();

    const contenu = JSON.parse(await readFile(chemin, "utf8"));
    expect(contenu.jeton).toBe("nouveau-proprietaire");
  });

  it("deux acquisitions dans le même processus via deux gestionnaires distincts sont sérialisées", async () => {
    const verrousA = gestionnaire();
    const verrousB = gestionnaire();
    const evenements: string[] = [];

    const lockA = await verrousA.acquire("auth", new Date(Date.now() + 2000));
    evenements.push("A-acquis");

    const acquisitionB = verrousB.acquire("auth", new Date(Date.now() + 2000)).then((lock) => {
      evenements.push("B-acquis");
      return lock;
    });

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(evenements).toEqual(["A-acquis"]);

    evenements.push("A-libere");
    await lockA.release();

    const lockB = await acquisitionB;
    expect(evenements).toEqual(["A-acquis", "A-libere", "B-acquis"]);
    await lockB.release();
  });
});
