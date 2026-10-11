import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ajouterDossier, ErreurService, type DepsDossiers } from "../../../dist/index.js";
import {
  ctxDe,
  creerRepertoireTemporaire,
  depsDe,
  DOMAIN_ID_1,
  ecrireFichierInitial,
  nettoyerRepertoire,
  relireFichier,
  TENANT_ID_1,
} from "./fixtures.js";

function attendCode(promesse: Promise<unknown>, code: string): Promise<void> {
  return expect(promesse).rejects.toMatchObject({ erreur: { code } });
}

const ID_CPT_2 = "66666666-6666-4666-8666-666666666666";
const ID_CPT_3 = "77777777-7777-4777-8777-777777777777";

describe("services/dossiers : ajouterDossier", () => {
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

  it("ajout réussi CPT : une seule route appelée, bon en-tête tenantid, dossier persisté, reste inchangé", async () => {
    const deps = depsDe(dir, [{ status: 200, corps: { domainName: "D", domainCode: "C", version: "1" } }]);
    const ctx = ctxDe(dir);

    const resultat = await ajouterDossier(
      deps,
      { famille: "hubbix-compta", id: ID_CPT_2, alias: "second", nom: "Second" },
      ctx,
    );

    expect(resultat).toEqual({ alias: "second", famille: "hubbix-compta", id: ID_CPT_2, nom: "Second" });
    expect(deps.transport.appels).toHaveLength(1);
    expect(deps.transport.appels[0]!.headers!["tenantid"]).toBe(ID_CPT_2);
    expect(deps.transport.appels[0]!.url).toContain("/domain-information");

    const fichier = await relireFichier(chemin);
    const prod = fichier.profiles.default!.dossiers.prod;
    expect(prod).toHaveLength(2);
    expect(prod.find((d) => d.alias === "second")).toEqual({
      alias: "second",
      famille: "hubbix-compta",
      nom: "Second",
      tenantId: ID_CPT_2,
    });
    expect(prod.find((d) => d.alias === "dossier-prod")).toEqual({
      alias: "dossier-prod",
      famille: "hubbix-compta",
      nom: null,
      tenantId: TENANT_ID_1,
    });
    expect(fichier.profiles.default!.dossiers.preprod).toEqual([]);
    expect(fichier.profiles.default!.defaultDossier).toEqual({ prod: "dossier-prod" });
  });

  it("ajout réussi GC : une seule route appelée, bon en-tête DomainId, nom null par défaut", async () => {
    const deps = depsDe(dir, [{ status: 200, corps: [{ label: "x", rate: "20", territoriality: 0, isDefault: true }] }]);
    const ctx = ctxDe(dir);

    const resultat = await ajouterDossier(deps, { famille: "hubbix-gescom", id: DOMAIN_ID_1, alias: "gc-1" }, ctx);

    expect(resultat).toEqual({ alias: "gc-1", famille: "hubbix-gescom", id: DOMAIN_ID_1, nom: null });
    expect(deps.transport.appels).toHaveLength(1);
    expect(deps.transport.appels[0]!.headers!["DomainId"]).toBe(DOMAIN_ID_1);
    expect(deps.transport.appels[0]!.url).toContain("/vat-rates");

    const fichier = await relireFichier(chemin);
    expect(fichier.profiles.default!.dossiers.prod.find((d) => d.alias === "gc-1")).toEqual({
      alias: "gc-1",
      famille: "hubbix-gescom",
      nom: null,
      domainId: DOMAIN_ID_1,
    });
  });

  it.each([
    ["404 ⇒ NOT_FOUND", [{ status: 404, corps: {} }], "NOT_FOUND"],
    ["401 deux fois ⇒ AUTH_REQUIRED", [{ status: 401, corps: {} }, { status: 401, corps: {} }], "AUTH_REQUIRED"],
  ] as const)("refus distant (%s) : config.json identique à l'octet près", async (_nom, reponses, code) => {
    const avant = await readFile(chemin, "utf8");
    const statAvant = await stat(chemin);
    const deps = depsDe(dir, [...reponses]);
    const ctx = ctxDe(dir);

    await attendCode(ajouterDossier(deps, { famille: "hubbix-compta", id: ID_CPT_2, alias: "second" }, ctx), code);

    const apres = await readFile(chemin, "utf8");
    const statApres = await stat(chemin);
    expect(apres).toBe(avant);
    expect(statApres.mtimeMs).toBe(statAvant.mtimeMs);
  });

  it("refus distant 503 x3 ⇒ UPSTREAM_UNAVAILABLE, config.json identique à l'octet près", async () => {
    const avant = await readFile(chemin, "utf8");
    const deps = depsDe(dir, [
      { status: 503, corps: {} },
      { status: 503, corps: {} },
      { status: 503, corps: {} },
    ]);
    const ctx = ctxDe(dir);

    const promesse = ajouterDossier(deps, { famille: "hubbix-compta", id: ID_CPT_2, alias: "second" }, ctx);
    const assertion = attendCode(promesse, "UPSTREAM_UNAVAILABLE");
    await vi.waitFor(() => expect(deps.transport.appels).toHaveLength(1));
    deps.horloge.avancer(1000);
    await vi.waitFor(() => expect(deps.transport.appels).toHaveLength(2));
    deps.horloge.avancer(2000);
    await vi.waitFor(() => expect(deps.transport.appels).toHaveLength(3));
    await assertion;

    expect(await readFile(chemin, "utf8")).toBe(avant);
  });

  it.each([
    ["alias invalide", { famille: "hubbix-compta" as const, id: ID_CPT_2, alias: "Alias Invalide" }],
    ["alias en double", { famille: "hubbix-compta" as const, id: ID_CPT_2, alias: "dossier-prod" }],
    ["famille inactive", { famille: "hubbix-gescom" as const, id: DOMAIN_ID_1, alias: "x" }],
    ["GUID invalide", { famille: "hubbix-compta" as const, id: "pas-un-guid", alias: "x" }],
    ["id déjà déclaré", { famille: "hubbix-compta" as const, id: TENANT_ID_1, alias: "x" }],
  ])("contrôle local (%s) : erreur, zéro appel transport", async (_nom, entree) => {
    const ctx = ctxDe(dir, entree.famille === "hubbix-gescom" ? { famillesActives: ["hubbix-compta"] } : undefined);
    const deps = depsDe(dir, []);

    await expect(ajouterDossier(deps, entree, ctx)).rejects.toBeInstanceOf(ErreurService);
    expect(deps.transport.appels).toHaveLength(0);
  });

  it("deux ajouterDossier concurrents sur des alias distincts persistent les deux dossiers", async () => {
    const depsA: DepsDossiers = depsDe(dir, [{ status: 200, corps: { domainName: "D", domainCode: "C", version: "1" } }]);
    const depsB: DepsDossiers = depsDe(dir, [{ status: 200, corps: { domainName: "D", domainCode: "C", version: "1" } }]);
    const ctx = ctxDe(dir);

    await Promise.all([
      ajouterDossier(depsA, { famille: "hubbix-compta", id: ID_CPT_2, alias: "concurrent-a" }, ctx),
      ajouterDossier(depsB, { famille: "hubbix-compta", id: ID_CPT_3, alias: "concurrent-b" }, ctx),
    ]);

    const fichier = await relireFichier(chemin);
    const alias = fichier.profiles.default!.dossiers.prod.map((d) => d.alias);
    expect(alias).toContain("concurrent-a");
    expect(alias).toContain("concurrent-b");
    expect(alias).toContain("dossier-prod");
    expect(fichier.profiles.default!.dossiers.prod).toHaveLength(3);
  });

  it("résultat écrit valide pour schemaFichierConfig et relu par chargerConfig", async () => {
    const { chargerConfig, creerLecteurFs, racineConfig, cheminFichierConfig } = await import(
      "../../../dist/index.js"
    );
    const journal = { avertir: () => undefined };
    const racine = racineConfig({ XDG_CONFIG_HOME: dir }, dir, journal);
    const cheminImbrique = cheminFichierConfig(racine);
    await (await import("node:fs/promises")).mkdir(racine, { recursive: true });
    await ecrireFichierInitial(cheminImbrique);

    const deps = depsDe(dir, [{ status: 200, corps: { domainName: "D", domainCode: "C", version: "1" } }]);
    const ctx = ctxDe(dir, { chemin: cheminImbrique });
    await ajouterDossier(deps, { famille: "hubbix-compta", id: ID_CPT_2, alias: "second" }, ctx);

    const config = await chargerConfig({
      lecteur: creerLecteurFs(),
      env: { XDG_CONFIG_HOME: dir },
      home: dir,
      cli: {},
      journal,
    });
    expect(config.dossiers.prod.map((d) => d.alias)).toContain("second");
  });
});
