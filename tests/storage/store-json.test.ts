import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { creerOperationsFichierNode, creerStoreJson, ErreurStockage, type StoreJson } from "../../dist/index.js";
import { avecEchecInjecte, avecEspion, creerRepertoireTemporaire, nettoyerRepertoire } from "./fixtures.js";

interface Compteur {
  readonly valeur: number;
}

describe("store-json.ts", () => {
  let dir: string;
  let chemin: string;
  let store: StoreJson;

  beforeEach(async () => {
    dir = await creerRepertoireTemporaire();
    chemin = join(dir, "etat.json");
    store = creerStoreJson({ operations: creerOperationsFichierNode() });
  });

  afterEach(async () => {
    await nettoyerRepertoire(dir);
  });

  it("aller-retour : ecrire puis lire renvoie la même valeur", async () => {
    await store.ecrire<Compteur>(chemin, "compteur", { valeur: 42 });
    const relu = await store.lire<Compteur>(chemin, "compteur");
    expect(relu).toEqual({ valeur: 42 });
  });

  it("fichier absent ⇒ null", async () => {
    const relu = await store.lire(chemin, "compteur");
    expect(relu).toBeNull();
  });

  it("storeVersion supérieure à celle du binaire ⇒ erreur, fichier inchangé", async () => {
    const contenuInitial = JSON.stringify({ storeVersion: 2, type: "compteur", data: { valeur: 1 } });
    await writeFile(chemin, contenuInitial, "utf8");

    await expect(store.lire(chemin, "compteur")).rejects.toMatchObject({
      erreur: { code: "AUTH_STORAGE_FAILED" },
    });

    const apres = await readFile(chemin, "utf8");
    expect(apres).toBe(contenuInitial);
  });

  it("JSON tronqué ⇒ erreur, pas d'état vide", async () => {
    await writeFile(chemin, '{"storeVersion":1,"type":"compteur","data":{"valeur":', "utf8");

    await expect(store.lire(chemin, "compteur")).rejects.toMatchObject({
      erreur: { code: "AUTH_STORAGE_FAILED" },
    });
  });

  it("type inattendu ⇒ erreur", async () => {
    await store.ecrire<Compteur>(chemin, "compteur", { valeur: 1 });
    await expect(store.lire(chemin, "autre-type")).rejects.toBeInstanceOf(ErreurStockage);
  });

  it("le fichier temporaire est créé dans le même répertoire que la cible", async () => {
    const { operations, appels } = avecEspion(creerOperationsFichierNode(), "ouvrirExclusif");
    const storeEspionne = creerStoreJson({ operations });
    await storeEspionne.ecrire<Compteur>(chemin, "compteur", { valeur: 1 });

    expect(appels).toHaveLength(1);
    const cheminTemporaire = appels[0]?.[0] as string;
    expect(join(cheminTemporaire, "..")).toBe(dir);
  });

  it("aucun temporaire résiduel après un succès", async () => {
    await store.ecrire<Compteur>(chemin, "compteur", { valeur: 1 });
    const entrees = await readdir(dir);
    expect(entrees.some((e) => e.startsWith(".tmp-"))).toBe(false);
  });

  it("aucun temporaire résiduel après un échec", async () => {
    const echec = avecEchecInjecte(creerOperationsFichierNode(), "ecrireTout", 1, "ENOSPC");
    const storeEnPanne = creerStoreJson({ operations: echec });
    await expect(storeEnPanne.ecrire<Compteur>(chemin, "compteur", { valeur: 1 })).rejects.toBeInstanceOf(
      ErreurStockage,
    );
    const entrees = await readdir(dir);
    expect(entrees.some((e) => e.startsWith(".tmp-"))).toBe(false);
  });

  it("ENOSPC injecté sur ecrireTout ⇒ AUTH_STORAGE_FAILED, ancienne valeur toujours lisible", async () => {
    await store.ecrire<Compteur>(chemin, "compteur", { valeur: 1 });

    const echec = avecEchecInjecte(creerOperationsFichierNode(), "ecrireTout", 1, "ENOSPC");
    const storeEnPanne = creerStoreJson({ operations: echec });
    await expect(storeEnPanne.ecrire<Compteur>(chemin, "compteur", { valeur: 2 })).rejects.toMatchObject({
      erreur: { code: "AUTH_STORAGE_FAILED" },
    });

    const relu = await store.lire<Compteur>(chemin, "compteur");
    expect(relu).toEqual({ valeur: 1 });
  });

  it("EACCES injecté ⇒ PERMISSION_DENIED", async () => {
    const echec = avecEchecInjecte(creerOperationsFichierNode(), "ouvrirExclusif", 1, "EACCES");
    const storeEnPanne = creerStoreJson({ operations: echec });
    await expect(storeEnPanne.ecrire<Compteur>(chemin, "compteur", { valeur: 1 })).rejects.toMatchObject({
      erreur: { code: "PERMISSION_DENIED" },
    });
  });

  it("aucun message d'erreur ne contient la valeur écrite", async () => {
    const marqueur = "VALEUR-SECRETE-UNIQUE-0xCAFE";
    const echec = avecEchecInjecte(creerOperationsFichierNode(), "ecrireTout", 1, "ENOSPC");
    const storeEnPanne = creerStoreJson({ operations: echec });
    try {
      await storeEnPanne.ecrire(chemin, "compteur", { valeur: marqueur });
      expect.unreachable();
    } catch (erreur) {
      const texte = JSON.stringify(erreur instanceof ErreurStockage ? erreur.erreur : erreur);
      expect(texte.includes(marqueur)).toBe(false);
    }
  });
});
