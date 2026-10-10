import { describe, expect, it } from "vitest";
import { capacitesCompta, verifierCapaciteSupportee } from "../../../dist/index.js";

describe("compta/capacites.ts — capacités non supportées déclarées (D-T09-5)", () => {
  it("expose exactement les 6 capacités non supportées avec motif", () => {
    const capacites = capacitesCompta();
    expect(capacites).toHaveLength(6);
    expect(capacites.every((c) => c.statut === "non_supportee")).toBe(true);
    expect(capacites.every((c) => (c.motif?.length ?? 0) > 0)).toBe(true);
    expect(capacites.map((c) => c.nom)).toEqual([
      "filtre_statut_bancaire",
      "filtre_categorie_tiers",
      "filtre_nature_ligne",
      "tri_explicite",
      "echeancier_cpt",
      "ca_cpt",
    ]);
  });

  it("`verifierCapaciteSupportee` ne lève rien quand la capacité n'est pas demandée", () => {
    expect(() => verifierCapaciteSupportee("filtre_statut_bancaire", false)).not.toThrow();
  });

  it("`verifierCapaciteSupportee` lève UNSUPPORTED_CAPABILITY quand demandée et non supportée", () => {
    expect(() => verifierCapaciteSupportee("tri_explicite", true)).toThrowError();
  });

  it("`verifierCapaciteSupportee` ne lève rien pour un nom hors de la liste (pas une capacité CPT)", () => {
    expect(() => verifierCapaciteSupportee("capacite-inexistante", true)).not.toThrow();
  });
});
