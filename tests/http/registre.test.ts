import { describe, expect, it } from "vitest";
import { REGISTRE_ROUTES, segmentsDuGabarit } from "../../dist/index.js";

/** Exactement la liste de la décision 4 (07 contrats T07), transcrite de 02 §2/§3. */
const IDS_ATTENDUS = [
  "cpt-domain-information",
  "cpt-folder-settings",
  "cpt-auxiliary-account-types",
  "cpt-auxiliary-accounts",
  "cpt-auxiliary-account-detail",
  "cpt-general-account",
  "cpt-general-account-detail",
  "cpt-journals",
  "cpt-journal-detail",
  "cpt-lines-entries",
  "cpt-entry-detail",
  "cpt-search-entries",
  "cpt-bank-transactions",
  "cpt-vat-rate",
  "gc-customer-detail",
  "gc-items",
  "gc-item-good-detail",
  "gc-item-service-detail",
  "gc-sale-documents",
  "gc-sale-invoice-detail",
  "gc-sale-invoice-validated-detail",
  "gc-sale-credit-detail",
  "gc-sale-credit-validated-detail",
  "gc-sale-quote-detail",
  "gc-sale-quote-invoiced-detail",
  "gc-sale-deposit-invoice-detail",
  "gc-sale-deposit-credit-detail",
  "gc-sale-commitments",
  "gc-settlements",
  "gc-vat-rates",
];

/** Paramètres 🟡 explicitement exclus par la décision 5, par route. */
const PARAMETRES_EXCLUS: Record<string, string[]> = {
  "cpt-auxiliary-accounts": ["category"],
  "cpt-lines-entries": ["journals", "nature"],
  "cpt-bank-transactions": ["status", "bankAccount", "bankAccounts"],
  "cpt-journals": ["filter", "order"],
  "gc-items": ["filter.query"],
  "gc-sale-documents": ["filter.query"],
  "gc-sale-commitments": ["filter.query"],
  "gc-settlements": ["filter.query"],
};

describe("registre.ts — critère #13", () => {
  it("le jeu d'identifiants de routes est exactement celui de la décision 4", () => {
    expect(REGISTRE_ROUTES.map((r) => r.id).sort()).toEqual([...IDS_ATTENDUS].sort());
  });

  it("aucune méthode autre que GET", () => {
    for (const route of REGISTRE_ROUTES) {
      expect(route.methode).toBe("GET");
    }
  });

  it("chaque segment du gabarit de chemin est déclaré dans `segments`, et réciproquement", () => {
    for (const route of REGISTRE_ROUTES) {
      expect(segmentsDuGabarit(route.chemin).sort()).toEqual([...route.segments].sort());
    }
  });

  it("aucun paramètre 🟡 exclu par la décision 5 n'est déclaré sur sa route", () => {
    for (const [routeId, exclus] of Object.entries(PARAMETRES_EXCLUS)) {
      const route = REGISTRE_ROUTES.find((r) => r.id === routeId);
      expect(route).toBeDefined();
      for (const parametre of exclus) {
        expect(route!.parametres).not.toContain(parametre);
      }
    }
  });

  it("toutes les routes métier ciblent l'un des deux préfixes documentés", () => {
    for (const route of REGISTRE_ROUTES) {
      expect(["/hubbix-cpttpe/api/v1", "/hubbix-gctpe/api/public/v1"]).toContain(route.prefixe);
      expect(route.hote).toBe("metier");
    }
  });
});
