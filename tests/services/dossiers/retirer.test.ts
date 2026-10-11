import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ErreurService, retirerDossier } from "../../../dist/index.js";
import {
  ctxDe,
  creerRepertoireTemporaire,
  depsDe,
  ecrireFichierInitial,
  nettoyerRepertoire,
  relireFichier,
  TENANT_ID_1,
} from "./fixtures.js";

describe("services/dossiers : retirerDossier", () => {
  let dir: string;
  let chemin: string;

  beforeEach(async () => {
    dir = await creerRepertoireTemporaire();
    chemin = join(dir, "config.json");
    await ecrireFichierInitial(chemin);
  });

  afterEach(async () => {
    await nettoyerRepertoire(dir);
  });

  it("retrait simple : le dossier disparaît, aucun appel transport, defaultDossier conservé si distinct", async () => {
    const deps = depsDe(dir, []);
    const ctx = ctxDe(dir);

    // Ajoute un second dossier non défaut pour vérifier qu'un retrait simple ne touche pas au défaut.
    const avecSecond = await relireFichier(chemin);
    avecSecond.profiles.default!.dossiers.prod.push({
      alias: "second",
      famille: "hubbix-gescom",
      nom: null,
      domainId: "22222222-2222-4222-8222-222222222222",
    });
    await ecrireFichierInitial(chemin, avecSecond);

    await retirerDossier(deps, { alias: "second" }, ctx);

    expect(deps.transport.appels).toHaveLength(0);
    const fichier = await relireFichier(chemin);
    expect(fichier.profiles.default!.dossiers.prod.map((d) => d.alias)).toEqual(["dossier-prod"]);
    expect(fichier.profiles.default!.defaultDossier).toEqual({ prod: "dossier-prod" });
  });

  it("retrait du dossier par défaut efface defaultDossier[environnement]", async () => {
    const deps = depsDe(dir, []);
    const ctx = ctxDe(dir);

    await retirerDossier(deps, { alias: "dossier-prod" }, ctx);

    expect(deps.transport.appels).toHaveLength(0);
    const fichier = await relireFichier(chemin);
    expect(fichier.profiles.default!.dossiers.prod).toEqual([]);
    expect(fichier.profiles.default!.defaultDossier).toBeUndefined();
  });

  it("alias absent ⇒ INVALID_ARGUMENT, config.json intact, aucun appel transport", async () => {
    const deps = depsDe(dir, []);
    const ctx = ctxDe(dir);
    const avant = await relireFichier(chemin);

    await expect(retirerDossier(deps, { alias: "nexiste-pas" }, ctx)).rejects.toMatchObject({
      erreur: { code: "INVALID_ARGUMENT" },
    });

    expect(deps.transport.appels).toHaveLength(0);
    expect(await relireFichier(chemin)).toEqual(avant);
  });

  it("l'erreur d'alias absent est une ErreurService", async () => {
    const deps = depsDe(dir, []);
    const ctx = ctxDe(dir);
    await expect(retirerDossier(deps, { alias: "nexiste-pas" }, ctx)).rejects.toBeInstanceOf(ErreurService);
  });

  it("résultat écrit valide pour schemaFichierConfig après retrait du dossier par défaut", async () => {
    const { schemaFichierConfig } = await import("../../../dist/index.js");
    const deps = depsDe(dir, []);
    const ctx = ctxDe(dir);
    await retirerDossier(deps, { alias: "dossier-prod" }, ctx);
    const fichier = await relireFichier(chemin);
    expect(schemaFichierConfig.safeParse(fichier).success).toBe(true);
  });

  it("ne touche pas au dossier par défaut d'un autre environnement", async () => {
    const avecPreprod = await relireFichier(chemin);
    avecPreprod.profiles.default!.dossiers.preprod = [
      { alias: "dossier-prod", famille: "hubbix-gescom", nom: null, domainId: "22222222-2222-4222-8222-222222222222" },
    ];
    avecPreprod.profiles.default!.defaultDossier = { prod: "dossier-prod", preprod: "dossier-prod" };
    await ecrireFichierInitial(chemin, avecPreprod);

    const deps = depsDe(dir, []);
    const ctx = ctxDe(dir);
    await retirerDossier(deps, { alias: "dossier-prod" }, ctx);

    const fichier = await relireFichier(chemin);
    expect(fichier.profiles.default!.defaultDossier).toEqual({ preprod: "dossier-prod" });
    expect(fichier.profiles.default!.dossiers.preprod).toHaveLength(1);
  });
});
