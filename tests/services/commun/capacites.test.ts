import { describe, expect, it } from "vitest";
import { capacitesCompta } from "../../../dist/index.js";
import { manifesteCapacites, verifierCapacitesEntree } from "../../../dist/index.js";
import type { CapaciteOutil } from "../../../dist/index.js";

function motifCompta(nom: string): string {
  const capacite = capacitesCompta().find((c) => c.nom === nom);
  if (capacite?.motif === undefined) {
    throw new Error(`Capacité Compta absente ou sans motif : ${nom}`);
  }
  return capacite.motif;
}

function trouver(famille: "hubbix-compta" | "hubbix-gescom", outil: string): CapaciteOutil {
  const capacite = manifesteCapacites(famille).find((c) => c.outil === outil);
  if (capacite === undefined) {
    throw new Error(`Outil absent du manifeste : ${outil}`);
  }
  return capacite;
}

function optionNonSupportee(capacite: CapaciteOutil, option: string): boolean {
  return capacite.optionsNonSupportees.some((o) => o.option === option);
}

describe("capacites.ts — D-T11-6 : chaque refus listé est présent dans le manifeste ou lève UNSUPPORTED_CAPABILITY", () => {
  it("rechercher_tiers.type : présent dans le manifeste avec un motif, et refusé par verifierCapacitesEntree", () => {
    const capacite = trouver("hubbix-compta", "rechercher_tiers");
    expect(optionNonSupportee(capacite, "type")).toBe(true);
    const option = capacite.optionsNonSupportees.find((o) => o.option === "type");
    expect(option?.motif.length).toBeGreaterThan(0);
    expect(() =>
      verifierCapacitesEntree("rechercher_tiers", "hubbix-compta", { type: "client" }),
    ).toThrowError();
    try {
      verifierCapacitesEntree("rechercher_tiers", "hubbix-compta", { type: "client" });
    } catch (erreur) {
      expect(erreur).toMatchObject({ erreur: { code: "UNSUPPORTED_CAPABILITY" } });
    }
  });

  it("fiche_tiers.code sur hubbix-gescom : présent dans le manifeste et refusé", () => {
    const capacite = trouver("hubbix-gescom", "fiche_tiers");
    expect(optionNonSupportee(capacite, "code")).toBe(true);
    expect(() =>
      verifierCapacitesEntree("fiche_tiers", "hubbix-gescom", { code: "C1" }),
    ).toThrowError();
  });

  it("fiche_tiers.code sur hubbix-compta : non concerné, `id` accepté sans refus", () => {
    const capacite = trouver("hubbix-compta", "fiche_tiers");
    expect(optionNonSupportee(capacite, "code")).toBe(false);
    expect(() => verifierCapacitesEntree("fiche_tiers", "hubbix-compta", { id: "T1" })).not.toThrow();
  });

  it("rechercher_articles.avec_stock=true : présent dans le manifeste et refusé", () => {
    const capacite = trouver("hubbix-gescom", "rechercher_articles");
    expect(optionNonSupportee(capacite, "avec_stock")).toBe(true);
    expect(() =>
      verifierCapacitesEntree("rechercher_articles", "hubbix-gescom", { avec_stock: true }),
    ).toThrowError();
  });

  it("rechercher_articles.avec_stock=false : jamais un refus implicite (07 §6)", () => {
    expect(() =>
      verifierCapacitesEntree("rechercher_articles", "hubbix-gescom", { avec_stock: false }),
    ).not.toThrow();
  });

  it("lister_documents_vente.types (commande, bon_livraison, bon_retour, avenant, situation, devis_etude) : refusés", () => {
    const capacite = trouver("hubbix-gescom", "lister_documents_vente");
    const option = capacite.optionsNonSupportees.find((o) => o.option === "types");
    expect(option).toBeDefined();
    expect(option?.valeurs).toEqual(
      expect.arrayContaining(["commande", "bon_livraison", "bon_retour", "avenant", "situation", "devis_etude"]),
    );
    for (const type of ["commande", "bon_livraison", "bon_retour", "avenant", "situation", "devis_etude"]) {
      expect(() =>
        verifierCapacitesEntree("lister_documents_vente", "hubbix-gescom", { types: [type] }),
      ).toThrowError();
    }
  });

  it("lister_documents_vente.types=['facture'] (type livré) : accepté", () => {
    expect(() =>
      verifierCapacitesEntree("lister_documents_vente", "hubbix-gescom", { types: ["facture"] }),
    ).not.toThrow();
  });

  it("lister_reglements.tiers : présent dans le manifeste et refusé", () => {
    const capacite = trouver("hubbix-gescom", "lister_reglements");
    expect(optionNonSupportee(capacite, "tiers")).toBe(true);
    expect(() =>
      verifierCapacitesEntree("lister_reglements", "hubbix-gescom", { tiers: "T1" }),
    ).toThrowError();
  });

  it("transactions_bancaires.statut : présent dans le manifeste et refusé", () => {
    const capacite = trouver("hubbix-compta", "transactions_bancaires");
    expect(optionNonSupportee(capacite, "statut")).toBe(true);
    expect(() =>
      verifierCapacitesEntree("transactions_bancaires", "hubbix-compta", { statut: "valide" }),
    ).toThrowError();
  });

  it("detail_document.reference.type (6 types non livrés) : refusé par UNSUPPORTED_CAPABILITY, jamais atteint le réseau", () => {
    const capacite = trouver("hubbix-gescom", "detail_document");
    const option = capacite.optionsNonSupportees.find((o) => o.option === "reference.type");
    expect(option).toBeDefined();
    for (const type of ["commande", "bon_livraison", "bon_retour", "avenant", "situation", "devis_etude"]) {
      expect(() =>
        verifierCapacitesEntree("detail_document", "hubbix-gescom", {
          reference: { id: "D1", type, statut: "provisoire" },
        }),
      ).toThrowError();
      try {
        verifierCapacitesEntree("detail_document", "hubbix-gescom", {
          reference: { id: "D1", type, statut: "provisoire" },
        });
      } catch (erreur) {
        expect(erreur).toMatchObject({ erreur: { code: "UNSUPPORTED_CAPABILITY" } });
      }
    }
  });

  it("detail_document.reference.type (type livré, ex. devis) : accepté", () => {
    expect(() =>
      verifierCapacitesEntree("detail_document", "hubbix-gescom", {
        reference: { id: "D1", type: "devis", statut: "provisoire" },
      }),
    ).not.toThrow();
  });

  it("detail_document par `numero` (pas de `reference`) : aucun chemin imbriqué à lire, accepté", () => {
    expect(() =>
      verifierCapacitesEntree("detail_document", "hubbix-gescom", { numero: "FA1" }),
    ).not.toThrow();
  });
});

describe("capacites.ts — D-T11-6/D-T11-7 : les motifs CPT réutilisés sont identiques à ceux de l'adapter (T09), jamais redéfinis", () => {
  it("transactions_bancaires.statut porte exactement le motif de `filtre_statut_bancaire`", () => {
    const capacite = trouver("hubbix-compta", "transactions_bancaires");
    const option = capacite.optionsNonSupportees.find((o) => o.option === "statut");
    expect(option?.motif).toBe(motifCompta("filtre_statut_bancaire"));
  });

  it("echeancier_clients refusé sur un dossier hubbix-compta porte exactement le motif de `echeancier_cpt` (A03)", () => {
    const capacite = trouver("hubbix-compta", "echeancier_clients");
    expect(capacite.statut).toBe("non_supportee");
    expect(capacite.motif).toBe(motifCompta("echeancier_cpt"));
  });
});

describe("capacites.ts — A01/A04 : aucune capacité de CA, acompte cumulé ou rapprochement inter-dossiers", () => {
  it("aucune option nommée `ca`, `ca_cumule`, `acompte_cumule` ou `rapprochement` dans le manifeste, pour aucune famille", () => {
    const motsInterdits = ["ca", "ca_cumule", "acompte_cumule", "rapprochement", "rapprochement_inter_dossiers"];
    for (const famille of ["hubbix-compta", "hubbix-gescom"] as const) {
      const manifeste = manifesteCapacites(famille);
      for (const capacite of manifeste) {
        for (const option of capacite.optionsNonSupportees) {
          expect(motsInterdits).not.toContain(option.option);
        }
      }
    }
  });

  it("aucun outil du manifeste ne s'appelle lui-même ca/chiffre_affaires/acompte_cumule", () => {
    for (const famille of ["hubbix-compta", "hubbix-gescom"] as const) {
      const outils = manifesteCapacites(famille).map((c) => c.outil);
      expect(outils).not.toContain("ca");
      expect(outils).not.toContain("chiffre_affaires");
      expect(outils).not.toContain("acompte_cumule");
    }
  });
});

describe("capacites.ts — pureté : 0 appel réseau, fonction synchrone", () => {
  it("manifesteCapacites ne retourne pas une Promise (pas d'E/S asynchrone)", () => {
    const resultat = manifesteCapacites("hubbix-compta");
    expect(resultat).not.toBeInstanceOf(Promise);
    expect(Array.isArray(resultat)).toBe(true);
  });

  it("verifierCapacitesEntree ne retourne pas une Promise", () => {
    const resultat = verifierCapacitesEntree("exercices", "hubbix-compta", {});
    expect(resultat).not.toBeInstanceOf(Promise);
    expect(resultat).toBeUndefined();
  });
});

describe("capacites.ts — garde de famille : un outil CPT est non_supportee côté GC et inversement", () => {
  it("rechercher_tiers (CPT) est non_supportee pour hubbix-gescom", () => {
    const capacite = trouver("hubbix-gescom", "rechercher_tiers");
    expect(capacite.statut).toBe("non_supportee");
    expect(capacite.motif).toBeDefined();
    expect(() =>
      verifierCapacitesEntree("rechercher_tiers", "hubbix-gescom", {}),
    ).toThrowError();
    try {
      verifierCapacitesEntree("rechercher_tiers", "hubbix-gescom", {});
    } catch (erreur) {
      expect(erreur).toMatchObject({ erreur: { code: "UNSUPPORTED_CAPABILITY" } });
    }
  });

  it("rechercher_articles (GC) est non_supportee pour hubbix-compta", () => {
    const capacite = trouver("hubbix-compta", "rechercher_articles");
    expect(capacite.statut).toBe("non_supportee");
    expect(() =>
      verifierCapacitesEntree("rechercher_articles", "hubbix-compta", {}),
    ).toThrowError();
  });

  it("fiche_tiers (les deux familles) : disponible pour hubbix-compta et hubbix-gescom", () => {
    expect(trouver("hubbix-compta", "fiche_tiers").statut).toBe("disponible");
    expect(trouver("hubbix-gescom", "fiche_tiers").statut).toBe("disponible");
  });
});

describe("capacites.ts — critère : le manifeste couvre les 14 outils pour chaque famille", () => {
  it("14 entrées pour hubbix-compta et hubbix-gescom", () => {
    expect(manifesteCapacites("hubbix-compta")).toHaveLength(14);
    expect(manifesteCapacites("hubbix-gescom")).toHaveLength(14);
  });
});
