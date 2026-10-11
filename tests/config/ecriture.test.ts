import { chmod, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  creerGestionnaireVerrous,
  creerOperationsFichierNode,
  ErreurConfig,
  ErreurStockage,
  modifierConfig,
  type DependancesEcritureConfig,
  type FichierConfig,
  type Identifiant,
} from "../../dist/index.js";
import { creerRepertoireTemporaire, nettoyerRepertoire } from "./fixtures.js";
import { avecEchecInjecte, creerHorlogeReelle } from "../storage/fixtures.js";

function fichierTest(): FichierConfig {
  return {
    schemaVersion: 1,
    profiles: {
      default: {
        env: "prod",
        clientId: "client-defaut",
        redirectUri: "http://127.0.0.1:9000/callback",
        pkce: "required",
        enabledFamilies: ["hubbix-compta", "hubbix-gescom"],
        quotaGroup: "grp",
        dossiers: {
          prod: [
            {
              alias: "dossier-prod",
              famille: "hubbix-compta",
              nom: null,
              tenantId: "11111111-1111-4111-8111-111111111111",
            },
          ],
          preprod: [],
        },
        defaultDossier: { prod: "dossier-prod" },
      },
    },
    quotaGroups: {
      grp: { maxPerDay: 10000, reserve: 500, minIntervalMs: 1000, resetTimezone: "Europe/Paris" },
    },
  } as unknown as FichierConfig;
}

async function ecrireFichierInitial(chemin: string, fichier: FichierConfig, mode = 0o600): Promise<void> {
  await writeFile(chemin, `${JSON.stringify(fichier, null, 2)}\n`);
  await chmod(chemin, mode);
}

function deadlineDans(ms: number): Date {
  return new Date(Date.now() + ms);
}

describe("config/ecriture.ts : modifierConfig", () => {
  let dir: string;
  let chemin: string;
  let deps: DependancesEcritureConfig;

  beforeEach(async () => {
    dir = await creerRepertoireTemporaire();
    chemin = join(dir, "config.json");
    deps = {
      verrous: creerGestionnaireVerrous({
        repertoire: dir,
        operations: creerOperationsFichierNode(),
        clock: creerHorlogeReelle(),
      }),
      operations: creerOperationsFichierNode(),
      chemin,
      deadline: deadlineDans(5000),
    };
  });

  afterEach(async () => {
    await nettoyerRepertoire(dir);
  });

  it("absent ⇒ CONFIG_INVALID, aucun fichier créé", async () => {
    await expect(
      modifierConfig(deps, "default" as Identifiant, "prod", (fichier) => fichier),
    ).rejects.toBeInstanceOf(ErreurConfig);

    const entrees = await readdir(dir);
    expect(entrees).toHaveLength(0);
  });

  it("round-trip : résultat valide, relu à l'octet, format 2 espaces + saut de ligne final", async () => {
    await ecrireFichierInitial(chemin, fichierTest());

    const resultat = await modifierConfig(deps, "default" as Identifiant, "prod", (fichier) => ({
      ...fichier,
      profiles: {
        ...fichier.profiles,
        default: {
          ...fichier.profiles.default!,
          dossiers: {
            ...fichier.profiles.default!.dossiers,
            prod: [
              ...fichier.profiles.default!.dossiers.prod,
              {
                alias: "second",
                famille: "hubbix-gescom" as const,
                nom: null,
                domainId: "22222222-2222-4222-8222-222222222222",
              },
            ],
          },
        },
      },
    }));

    expect(resultat.profiles.default!.dossiers.prod).toHaveLength(2);

    const brut = await readFile(chemin, "utf8");
    expect(brut.endsWith("\n")).toBe(true);
    expect(brut).not.toMatch(/\n\n$/);
    const parse = JSON.parse(brut);
    expect(parse).toEqual(resultat);
    expect(brut).toBe(`${JSON.stringify(parse, null, 2)}\n`);
  });

  it("transformation produisant un résultat invalide pour schemaFichierConfig ⇒ CONFIG_INVALID, fichier d'origine intact", async () => {
    await ecrireFichierInitial(chemin, fichierTest());
    const original = await readFile(chemin, "utf8");

    await expect(
      modifierConfig(deps, "default" as Identifiant, "prod", (fichier) => ({
        ...fichier,
        profiles: {
          ...fichier.profiles,
          default: { ...fichier.profiles.default!, dossiers: { prod: [{ alias: "x" }] } } as never,
        },
      })),
    ).rejects.toBeInstanceOf(ErreurConfig);

    expect(await readFile(chemin, "utf8")).toBe(original);
  });

  it("transformation modifiant un champ hors dossiers/defaultDossier de l'environnement visé ⇒ CONFIG_INVALID, fichier intact", async () => {
    await ecrireFichierInitial(chemin, fichierTest());
    const original = await readFile(chemin, "utf8");

    await expect(
      modifierConfig(deps, "default" as Identifiant, "prod", (fichier) => ({
        ...fichier,
        profiles: {
          ...fichier.profiles,
          default: { ...fichier.profiles.default!, clientId: "autre-client" },
        },
      })),
    ).rejects.toBeInstanceOf(ErreurConfig);

    expect(await readFile(chemin, "utf8")).toBe(original);
  });

  it("transformation modifiant dossiers d'un autre environnement que celui visé ⇒ CONFIG_INVALID", async () => {
    await ecrireFichierInitial(chemin, fichierTest());

    await expect(
      modifierConfig(deps, "default" as Identifiant, "prod", (fichier) => ({
        ...fichier,
        profiles: {
          ...fichier.profiles,
          default: {
            ...fichier.profiles.default!,
            dossiers: {
              ...fichier.profiles.default!.dossiers,
              preprod: [
                {
                  alias: "intrus",
                  famille: "hubbix-compta" as const,
                  nom: null,
                  tenantId: "33333333-3333-4333-8333-333333333333",
                },
              ],
            },
          },
        },
      })),
    ).rejects.toBeInstanceOf(ErreurConfig);
  });

  it("mode d'origine (0600) conservé après écriture", async () => {
    await ecrireFichierInitial(chemin, fichierTest(), 0o600);
    await modifierConfig(deps, "default" as Identifiant, "prod", (fichier) => fichier);
    const statut = await stat(chemin);
    expect(statut.mode & 0o777).toBe(0o600);
  });

  it("échec de rename simulé ⇒ fichier d'origine intact, aucun temporaire résiduel", async () => {
    await ecrireFichierInitial(chemin, fichierTest());
    const original = await readFile(chemin, "utf8");
    const operationsEnPanne = avecEchecInjecte(creerOperationsFichierNode(), "renommer", 1, "EIO");
    const depsEnPanne: DependancesEcritureConfig = { ...deps, operations: operationsEnPanne };

    await expect(
      modifierConfig(depsEnPanne, "default" as Identifiant, "prod", (fichier) => fichier),
    ).rejects.toBeInstanceOf(ErreurStockage);

    expect(await readFile(chemin, "utf8")).toBe(original);
    const entrees = await readdir(dir);
    expect(entrees.filter((e) => e.startsWith(".tmp-"))).toHaveLength(0);
  });

  it("deux modifications concurrentes sur des clés distinctes persistent les deux (verrou + relecture)", async () => {
    await ecrireFichierInitial(chemin, fichierTest());

    await Promise.all([
      modifierConfig(deps, "default" as Identifiant, "prod", (fichier) => ({
        ...fichier,
        profiles: {
          ...fichier.profiles,
          default: {
            ...fichier.profiles.default!,
            dossiers: {
              ...fichier.profiles.default!.dossiers,
              prod: [
                ...fichier.profiles.default!.dossiers.prod,
                {
                  alias: "concurrent-a",
                  famille: "hubbix-gescom" as const,
                  nom: null,
                  domainId: "44444444-4444-4444-8444-444444444444",
                },
              ],
            },
          },
        },
      })),
      modifierConfig(deps, "default" as Identifiant, "prod", (fichier) => ({
        ...fichier,
        profiles: {
          ...fichier.profiles,
          default: {
            ...fichier.profiles.default!,
            dossiers: {
              ...fichier.profiles.default!.dossiers,
              prod: [
                ...fichier.profiles.default!.dossiers.prod,
                {
                  alias: "concurrent-b",
                  famille: "hubbix-gescom" as const,
                  nom: null,
                  domainId: "55555555-5555-4555-8555-555555555555",
                },
              ],
            },
          },
        },
      })),
    ]);

    const brut = await readFile(chemin, "utf8");
    const fichierFinal = JSON.parse(brut) as FichierConfig;
    const alias = fichierFinal.profiles.default!.dossiers.prod.map((d) => d.alias);
    expect(alias).toContain("concurrent-a");
    expect(alias).toContain("concurrent-b");
    expect(alias).toContain("dossier-prod");
    expect(fichierFinal.profiles.default!.dossiers.prod).toHaveLength(3);
  });
});
