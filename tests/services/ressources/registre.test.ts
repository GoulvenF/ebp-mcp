import { describe, expect, it } from "vitest";
import { RESSOURCES_DOSSIER } from "../../../dist/index.js";

describe("RESSOURCES_DOSSIER (D-T12-13)", () => {
  it("associe les 4 suffixes v0.1 à leurs familles et à un service appelable", () => {
    const suffixes = RESSOURCES_DOSSIER.map((r) => r.suffixe);
    expect(suffixes).toEqual(["exercices", "journaux", "plan-comptable", "taux-tva"]);
    for (const definition of RESSOURCES_DOSSIER) {
      expect(definition.familles.length).toBeGreaterThan(0);
      expect(typeof definition.service).toBe("function");
    }
  });

  it("taux-tva est disponible sur les deux familles ; journaux/plan-comptable sur hubbix-compta seul", () => {
    const parSuffixe = new Map(RESSOURCES_DOSSIER.map((r) => [r.suffixe, r.familles]));
    expect(parSuffixe.get("taux-tva")).toEqual(["hubbix-compta", "hubbix-gescom"]);
    expect(parSuffixe.get("journaux")).toEqual(["hubbix-compta"]);
    expect(parSuffixe.get("plan-comptable")).toEqual(["hubbix-compta"]);
    expect(parSuffixe.get("exercices")).toEqual(["hubbix-compta"]);
  });
});
