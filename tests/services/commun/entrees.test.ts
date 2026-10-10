import { describe, expect, it } from "vitest";
import {
  BalanceComptesEntreeSchema,
  DetailDocumentEntreeSchema,
  DetailEcritureEntreeSchema,
  EcheancierClientsEntreeSchema,
  ExercicesEntreeSchema,
  FicheArticleEntreeSchema,
  FicheTiersEntreeSchema,
  GrandLivreEntreeSchema,
  ListerDocumentsVenteEntreeSchema,
  ListerEcrituresEntreeSchema,
  ListerReglementsEntreeSchema,
  RechercherArticlesEntreeSchema,
  RechercherTiersEntreeSchema,
  SCHEMAS_ENTREE_OUTILS,
  TransactionsBancairesEntreeSchema,
  validerEntree,
} from "../../../dist/index.js";

const UUID_VALIDE = "123e4567-e89b-12d3-a456-426614174000";

/** Une entrée minimale valide pour chacun des 14 outils (07 §6), écrite à la main. */
const ENTREES_MINIMALES_VALIDES: Record<keyof typeof SCHEMAS_ENTREE_OUTILS, Record<string, unknown>> = {
  rechercher_tiers: {},
  fiche_tiers: { id: "T001" },
  rechercher_articles: {},
  fiche_article: { code: "ART001" },
  lister_documents_vente: {},
  detail_document: { numero: "FA2026-0001" },
  echeancier_clients: {},
  lister_reglements: {},
  lister_ecritures: {},
  detail_ecriture: { id: UUID_VALIDE },
  transactions_bancaires: { du: "2026-01-01", au: "2026-01-31" },
  balance_comptes: { du: "2026-01-01", au: "2026-01-31" },
  grand_livre: { compte: "411000", du: "2026-01-01", au: "2026-01-31" },
  exercices: {},
};

describe("entrees.ts — critère : les 14 outils acceptent une entrée minimale valide", () => {
  for (const outil of Object.keys(SCHEMAS_ENTREE_OUTILS) as (keyof typeof SCHEMAS_ENTREE_OUTILS)[]) {
    it(`\`${outil}\` : l'entrée minimale écrite à la main ne lève pas`, () => {
      const schema = SCHEMAS_ENTREE_OUTILS[outil];
      expect(() => validerEntree(schema, ENTREES_MINIMALES_VALIDES[outil], outil)).not.toThrow();
    });
  }
});

describe("entrees.ts — critère : les 14 outils rejettent une clé inconnue (`.strict()`)", () => {
  for (const outil of Object.keys(SCHEMAS_ENTREE_OUTILS) as (keyof typeof SCHEMAS_ENTREE_OUTILS)[]) {
    it(`\`${outil}\` : une clé inconnue est rejetée avec INVALID_ARGUMENT`, () => {
      const schema = SCHEMAS_ENTREE_OUTILS[outil];
      const entree = { ...ENTREES_MINIMALES_VALIDES[outil], cle_inconnue_jamais_declaree: "x" };
      expect(() => validerEntree(schema, entree, outil)).toThrowError();
      try {
        validerEntree(schema, entree, outil);
        throw new Error("ne doit pas atteindre ce point");
      } catch (erreur) {
        expect(erreur).toMatchObject({ erreur: { code: "INVALID_ARGUMENT" } });
      }
    });
  }
});

describe("entrees.ts — critère : exclusivités « exactement un » (D-T11-3/D-T11-15)", () => {
  it("fiche_tiers : ni `id` ni `code` ⇒ INVALID_ARGUMENT", () => {
    expect(() => validerEntree(FicheTiersEntreeSchema, {}, "fiche_tiers")).toThrowError();
  });
  it("fiche_tiers : `id` seul ⇒ accepté", () => {
    expect(() => validerEntree(FicheTiersEntreeSchema, { id: "T1" }, "fiche_tiers")).not.toThrow();
  });
  it("fiche_tiers : `code` seul ⇒ accepté", () => {
    expect(() => validerEntree(FicheTiersEntreeSchema, { code: "C1" }, "fiche_tiers")).not.toThrow();
  });
  it("fiche_tiers : `id` et `code` ensemble ⇒ INVALID_ARGUMENT", () => {
    expect(() => validerEntree(FicheTiersEntreeSchema, { id: "T1", code: "C1" }, "fiche_tiers")).toThrowError();
  });

  it("fiche_article : ni `reference` ni `code` ⇒ INVALID_ARGUMENT", () => {
    expect(() => validerEntree(FicheArticleEntreeSchema, {}, "fiche_article")).toThrowError();
  });
  it("fiche_article : `reference` seule ⇒ accepté", () => {
    expect(() =>
      validerEntree(FicheArticleEntreeSchema, { reference: { id: "A1", type: "bien" } }, "fiche_article"),
    ).not.toThrow();
  });
  it("fiche_article : `code` seul ⇒ accepté", () => {
    expect(() => validerEntree(FicheArticleEntreeSchema, { code: "A1" }, "fiche_article")).not.toThrow();
  });
  it("fiche_article : `reference` et `code` ensemble ⇒ INVALID_ARGUMENT", () => {
    expect(() =>
      validerEntree(
        FicheArticleEntreeSchema,
        { reference: { id: "A1", type: "bien" }, code: "A1" },
        "fiche_article",
      ),
    ).toThrowError();
  });

  it("detail_document : ni `reference` ni `numero` ⇒ INVALID_ARGUMENT", () => {
    expect(() => validerEntree(DetailDocumentEntreeSchema, {}, "detail_document")).toThrowError();
  });
  it("detail_document : `numero` seul ⇒ accepté", () => {
    expect(() => validerEntree(DetailDocumentEntreeSchema, { numero: "FA1" }, "detail_document")).not.toThrow();
  });
  it("detail_document : `reference` seule ⇒ accepté", () => {
    expect(() =>
      validerEntree(
        DetailDocumentEntreeSchema,
        { reference: { id: "D1", type: "facture", statut: "valide" } },
        "detail_document",
      ),
    ).not.toThrow();
  });
  it("detail_document : `reference` et `numero` ensemble ⇒ INVALID_ARGUMENT", () => {
    expect(() =>
      validerEntree(
        DetailDocumentEntreeSchema,
        { reference: { id: "D1", type: "facture", statut: "valide" }, numero: "FA1" },
        "detail_document",
      ),
    ).toThrowError();
  });
});

describe("entrees.ts — critère : exclusivité « au plus un » (D-T11-11, balance_comptes)", () => {
  const BASE = { du: "2026-01-01", au: "2026-01-31" };
  it("ni `classe` ni `comptes` ⇒ accepté (aucun des deux n'est obligatoire)", () => {
    expect(() => validerEntree(BalanceComptesEntreeSchema, BASE, "balance_comptes")).not.toThrow();
  });
  it("`classe` seule ⇒ accepté", () => {
    expect(() => validerEntree(BalanceComptesEntreeSchema, { ...BASE, classe: "4" }, "balance_comptes")).not.toThrow();
  });
  it("`comptes` seul ⇒ accepté", () => {
    expect(() =>
      validerEntree(BalanceComptesEntreeSchema, { ...BASE, comptes: ["411000"] }, "balance_comptes"),
    ).not.toThrow();
  });
  it("`classe` et `comptes` ensemble ⇒ INVALID_ARGUMENT", () => {
    expect(() =>
      validerEntree(BalanceComptesEntreeSchema, { ...BASE, classe: "4", comptes: ["411000"] }, "balance_comptes"),
    ).toThrowError();
  });
});

describe("entrees.ts — critère : bornes de `limite` pour les outils avec `champsListe`", () => {
  const OUTILS_AVEC_LIMITE: (keyof typeof SCHEMAS_ENTREE_OUTILS)[] = [
    "rechercher_tiers",
    "rechercher_articles",
    "lister_documents_vente",
    "echeancier_clients",
    "lister_reglements",
    "lister_ecritures",
    "transactions_bancaires",
    "grand_livre",
  ];

  for (const outil of OUTILS_AVEC_LIMITE) {
    it(`\`${outil}\` : limite 0 ⇒ INVALID_ARGUMENT`, () => {
      const schema = SCHEMAS_ENTREE_OUTILS[outil];
      expect(() => validerEntree(schema, { ...ENTREES_MINIMALES_VALIDES[outil], limite: 0 }, outil)).toThrowError();
    });
    it(`\`${outil}\` : limite 501 ⇒ INVALID_ARGUMENT`, () => {
      const schema = SCHEMAS_ENTREE_OUTILS[outil];
      expect(() => validerEntree(schema, { ...ENTREES_MINIMALES_VALIDES[outil], limite: 501 }, outil)).toThrowError();
    });
    it(`\`${outil}\` : limite 1 ⇒ accepté`, () => {
      const schema = SCHEMAS_ENTREE_OUTILS[outil];
      expect(() => validerEntree(schema, { ...ENTREES_MINIMALES_VALIDES[outil], limite: 1 }, outil)).not.toThrow();
    });
    it(`\`${outil}\` : limite 500 ⇒ accepté`, () => {
      const schema = SCHEMAS_ENTREE_OUTILS[outil];
      expect(() => validerEntree(schema, { ...ENTREES_MINIMALES_VALIDES[outil], limite: 500 }, outil)).not.toThrow();
    });
  }
});

describe("entrees.ts — critère : dates invalides et ordre `du`/`au`", () => {
  const OUTILS_AVEC_DATES: { outil: keyof typeof SCHEMAS_ENTREE_OUTILS; champDate: "du" }[] = [
    { outil: "lister_documents_vente", champDate: "du" },
    { outil: "echeancier_clients", champDate: "du" },
    { outil: "lister_reglements", champDate: "du" },
    { outil: "lister_ecritures", champDate: "du" },
    { outil: "transactions_bancaires", champDate: "du" },
    { outil: "balance_comptes", champDate: "du" },
    { outil: "grand_livre", champDate: "du" },
  ];

  for (const { outil } of OUTILS_AVEC_DATES) {
    const base = ENTREES_MINIMALES_VALIDES[outil];

    it(`\`${outil}\` : format de date invalide ⇒ INVALID_ARGUMENT`, () => {
      const schema = SCHEMAS_ENTREE_OUTILS[outil];
      expect(() => validerEntree(schema, { ...base, du: "01/01/2026", au: "2026-01-31" }, outil)).toThrowError();
    });

    it(`\`${outil}\` : jour inexistant (2024-02-30) ⇒ INVALID_ARGUMENT`, () => {
      const schema = SCHEMAS_ENTREE_OUTILS[outil];
      expect(() => validerEntree(schema, { ...base, du: "2024-02-30", au: "2024-03-01" }, outil)).toThrowError();
    });

    it(`\`${outil}\` : \`du\` postérieur à \`au\` ⇒ INVALID_ARGUMENT`, () => {
      const schema = SCHEMAS_ENTREE_OUTILS[outil];
      expect(() => validerEntree(schema, { ...base, du: "2026-02-01", au: "2026-01-01" }, outil)).toThrowError();
    });

    it(`\`${outil}\` : \`du\` égal à \`au\` ⇒ accepté`, () => {
      const schema = SCHEMAS_ENTREE_OUTILS[outil];
      expect(() => validerEntree(schema, { ...base, du: "2026-01-01", au: "2026-01-01" }, outil)).not.toThrow();
    });
  }
});

describe("entrees.ts — régression : `classe` doit être `[1-9]`, jamais `[0-9]`", () => {
  const BASE = { du: "2026-01-01", au: "2026-01-31" };
  it("`classe: \"0\"` ⇒ rejeté", () => {
    expect(() => validerEntree(BalanceComptesEntreeSchema, { ...BASE, classe: "0" }, "balance_comptes")).toThrowError();
  });
  for (const chiffre of ["1", "2", "3", "4", "5", "6", "7", "8", "9"]) {
    it(`\`classe: "${chiffre}"\` ⇒ accepté`, () => {
      expect(() =>
        validerEntree(BalanceComptesEntreeSchema, { ...BASE, classe: chiffre }, "balance_comptes"),
      ).not.toThrow();
    });
  }
  it("`classe` à deux chiffres (ex. \"10\") ⇒ rejeté", () => {
    expect(() => validerEntree(BalanceComptesEntreeSchema, { ...BASE, classe: "10" }, "balance_comptes")).toThrowError();
  });
});

describe("entrees.ts — critère : `comptes[]` (balance_comptes)", () => {
  const BASE = { du: "2026-01-01", au: "2026-01-31" };

  it("tableau vide ⇒ rejeté", () => {
    expect(() => validerEntree(BalanceComptesEntreeSchema, { ...BASE, comptes: [] }, "balance_comptes")).toThrowError();
  });

  it("101 éléments ⇒ rejeté", () => {
    const comptes = Array.from({ length: 101 }, (_, i) => `C${i}`);
    expect(() =>
      validerEntree(BalanceComptesEntreeSchema, { ...BASE, comptes }, "balance_comptes"),
    ).toThrowError();
  });

  it("100 éléments ⇒ accepté", () => {
    const comptes = Array.from({ length: 100 }, (_, i) => `C${i}`);
    expect(() =>
      validerEntree(BalanceComptesEntreeSchema, { ...BASE, comptes }, "balance_comptes"),
    ).not.toThrow();
  });

  it("doublons ⇒ rejeté", () => {
    expect(() =>
      validerEntree(BalanceComptesEntreeSchema, { ...BASE, comptes: ["411000", "411000"] }, "balance_comptes"),
    ).toThrowError();
  });

  it("sans doublon ⇒ accepté", () => {
    expect(() =>
      validerEntree(BalanceComptesEntreeSchema, { ...BASE, comptes: ["411000", "512000"] }, "balance_comptes"),
    ).not.toThrow();
  });
});

describe("entrees.ts — critère : `SCHEMAS_ENTREE_OUTILS` couvre exactement les 14 outils", () => {
  it("14 clés, celles attendues", () => {
    const cles = Object.keys(SCHEMAS_ENTREE_OUTILS);
    expect(cles).toHaveLength(14);
    expect(new Set(cles)).toEqual(
      new Set([
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
      ]),
    );
  });
});

describe("entrees.ts — critère : exercices n'a aucun champ spécifique", () => {
  it("entrée vide acceptée", () => {
    expect(() => validerEntree(ExercicesEntreeSchema, {}, "exercices")).not.toThrow();
  });
  it("dossier et inclure_brut seuls acceptés", () => {
    expect(() =>
      validerEntree(ExercicesEntreeSchema, { dossier: "D1", inclure_brut: true }, "exercices"),
    ).not.toThrow();
  });
});

describe("entrees.ts — critère : detail_ecriture exige un UUID", () => {
  it("UUID valide ⇒ accepté", () => {
    expect(() => validerEntree(DetailEcritureEntreeSchema, { id: UUID_VALIDE }, "detail_ecriture")).not.toThrow();
  });
  it("chaîne non UUID ⇒ rejeté", () => {
    expect(() => validerEntree(DetailEcritureEntreeSchema, { id: "pas-un-uuid" }, "detail_ecriture")).toThrowError();
  });
});

describe("entrees.ts — critère : transactions_bancaires exige `du`/`au` (non optionnels)", () => {
  it("sans `du`/`au` ⇒ rejeté", () => {
    expect(() => validerEntree(TransactionsBancairesEntreeSchema, {}, "transactions_bancaires")).toThrowError();
  });
});

describe("entrees.ts — critère : rechercher_tiers / rechercher_articles / lister_documents_vente sans filtre sont acceptés", () => {
  it("rechercher_tiers vide", () => {
    expect(() => validerEntree(RechercherTiersEntreeSchema, {}, "rechercher_tiers")).not.toThrow();
  });
  it("rechercher_articles vide", () => {
    expect(() => validerEntree(RechercherArticlesEntreeSchema, {}, "rechercher_articles")).not.toThrow();
  });
  it("lister_documents_vente vide", () => {
    expect(() => validerEntree(ListerDocumentsVenteEntreeSchema, {}, "lister_documents_vente")).not.toThrow();
  });
  it("echeancier_clients vide", () => {
    expect(() => validerEntree(EcheancierClientsEntreeSchema, {}, "echeancier_clients")).not.toThrow();
  });
  it("lister_reglements vide", () => {
    expect(() => validerEntree(ListerReglementsEntreeSchema, {}, "lister_reglements")).not.toThrow();
  });
  it("lister_ecritures vide", () => {
    expect(() => validerEntree(ListerEcrituresEntreeSchema, {}, "lister_ecritures")).not.toThrow();
  });
  it("grand_livre sans compte ⇒ rejeté (compte obligatoire)", () => {
    expect(() =>
      validerEntree(GrandLivreEntreeSchema, { du: "2026-01-01", au: "2026-01-31" }, "grand_livre"),
    ).toThrowError();
  });
});
