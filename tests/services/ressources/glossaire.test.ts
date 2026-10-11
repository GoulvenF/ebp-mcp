import { describe, expect, it } from "vitest";
import { GLOSSAIRE, GlossaireSchema } from "../../../dist/index.js";

describe("glossaire (D-T12-13)", () => {
  it("conforme à son schéma", () => {
    expect(() => GlossaireSchema.parse(GLOSSAIRE)).not.toThrow();
  });

  it("entre 10 et 20 termes", () => {
    expect(GLOSSAIRE.length).toBeGreaterThanOrEqual(10);
    expect(GLOSSAIRE.length).toBeLessThanOrEqual(20);
  });

  it("termes uniques", () => {
    const termes = GLOSSAIRE.map((t) => t.terme);
    expect(new Set(termes).size).toBe(termes.length);
  });

  it("FR et EN non vides pour chaque terme", () => {
    for (const terme of GLOSSAIRE) {
      expect(terme.fr.trim().length).toBeGreaterThan(0);
      expect(terme.en.trim().length).toBeGreaterThan(0);
    }
  });
});
