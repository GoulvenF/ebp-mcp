import { describe, expect, it } from "vitest";
import { creerCompteurOccurrences, idLigneLocale, montantDepuisSource } from "../../../dist/index.js";

describe("compta/lignes.ts — montantDepuisSource (D-T09-3)", () => {
  it("chaîne décimale ⇒ decimalDepuisLexeme, jamais Number/parseFloat", () => {
    const avertissements: string[] = [];
    expect(montantDepuisSource("1287.5000", "x", avertissements)).toBe("1287.5");
    expect(avertissements).toEqual([]);
  });

  it("chaîne illisible ⇒ null + avertissement citant la valeur, jamais 0", () => {
    const avertissements: string[] = [];
    expect(montantDepuisSource("abc", "x", avertissements)).toBeNull();
    expect(avertissements).toHaveLength(1);
    expect(avertissements[0]).toContain("abc");
  });

  it("nombre JSON exploitable sans ambiguïté ⇒ converti", () => {
    const avertissements: string[] = [];
    expect(montantDepuisSource(42, "x", avertissements)).toBe("42");
    expect(avertissements).toEqual([]);
  });

  it("nombre JSON non exploitable (entier non sûr) ⇒ null + avertissement, jamais 0", () => {
    const avertissements: string[] = [];
    const valeurNonSure = 2 ** 60;
    expect(montantDepuisSource(valeurNonSure, "x", avertissements)).toBeNull();
    expect(avertissements).toHaveLength(1);
  });

  it("`null`/`undefined` ⇒ `null` sans avertissement (côté inutilisé d'une ligne banque)", () => {
    const avertissements: string[] = [];
    expect(montantDepuisSource(null, "x", avertissements)).toBeNull();
    expect(montantDepuisSource(undefined, "x", avertissements)).toBeNull();
    expect(avertissements).toEqual([]);
  });

  it("type inattendu (booléen) ⇒ null + avertissement", () => {
    const avertissements: string[] = [];
    expect(montantDepuisSource(true, "x", avertissements)).toBeNull();
    expect(avertissements).toHaveLength(1);
  });
});

describe("compta/lignes.ts — idLigneLocale (D-T09-2)", () => {
  it("déterministe pour un même contenu source", () => {
    const champs = { a: 1, b: "x" };
    expect(idLigneLocale(champs, 1)).toBe(idLigneLocale({ b: "x", a: 1 }, 1));
  });

  it("préfixé `local:`, jamais une identité EBP", () => {
    expect(idLigneLocale({ a: 1 }, 1)).toMatch(/^local:[0-9a-f]{16}-1$/);
  });

  it("rang distinct ⇒ id distinct, même contenu source", () => {
    expect(idLigneLocale({ a: 1 }, 1)).not.toBe(idLigneLocale({ a: 1 }, 2));
  });

  it("`creerCompteurOccurrences` attribue des rangs croissants aux signatures identiques", () => {
    const rangDe = creerCompteurOccurrences();
    const champs = { a: 1 };
    expect(rangDe(champs)).toBe(1);
    expect(rangDe(champs)).toBe(2);
    expect(rangDe({ a: 2 })).toBe(1);
  });
});
