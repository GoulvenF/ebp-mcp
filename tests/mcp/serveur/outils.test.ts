import { describe, expect, it } from "vitest";
import { construireListeOutils } from "../../../dist/index.js";

const NOMS_ATTENDUS = [
  "rechercher_tiers",
  "fiche_tiers",
  "rechercher_articles",
  "fiche_article",
  "lister_documents_vente",
  "detail_document",
  "echeancier_clients",
  "lister_reglements",
  "lister_ecritures",
  "detail_ecriture",
  "transactions_bancaires",
  "balance_comptes",
  "grand_livre",
  "exercices",
  "ebp_lister_dossiers",
  "ebp_choisir_dossier",
  "ebp_statut",
];

describe("construireListeOutils (D-T12-12)", () => {
  const outils = construireListeOutils();

  it("expose exactement les 17 noms attendus, sans catalogue futur", () => {
    expect(outils.map((o) => o.name)).toEqual(NOMS_ATTENDUS);
  });

  it("chaque `inputSchema` est un objet strict (`additionalProperties: false`)", () => {
    for (const outil of outils) {
      expect(outil.inputSchema.type).toBe("object");
      expect((outil.inputSchema as Record<string, unknown>)["additionalProperties"]).toBe(false);
    }
  });

  it("chaque description contient un paragraphe FR puis `EN:`", () => {
    for (const outil of outils) {
      expect(outil.description).toBeDefined();
      expect(outil.description).toContain("EN:");
      const indexEn = outil.description!.indexOf("EN:");
      expect(indexEn).toBeGreaterThan(0);
    }
  });

  it("les 14 lectures EBP portent les annotations de lecture (D-T12-12)", () => {
    for (const nom of NOMS_ATTENDUS.filter((n) => !n.startsWith("ebp_"))) {
      const outil = outils.find((o) => o.name === nom)!;
      expect(outil.annotations).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      });
    }
  });

  it("`ebp_lister_dossiers` et `ebp_statut` sont des lectures locales (`openWorldHint: false`)", () => {
    for (const nom of ["ebp_lister_dossiers", "ebp_statut"]) {
      const outil = outils.find((o) => o.name === nom)!;
      expect(outil.annotations).toMatchObject({ readOnlyHint: true, openWorldHint: false });
    }
  });

  it("`ebp_choisir_dossier` est annoté comme une mutation locale du contexte de session (D-T12-12)", () => {
    const outil = outils.find((o) => o.name === "ebp_choisir_dossier")!;
    expect(outil.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    });
    expect(outil.description?.toLowerCase()).toContain("mutation locale du contexte de session");
  });

  it("chaque outil porte un `outputSchema` objet généré par `z.toJSONSchema`", () => {
    for (const outil of outils) {
      expect(outil.outputSchema?.type).toBe("object");
    }
  });
});
