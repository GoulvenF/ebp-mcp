import { describe, expect, it } from "vitest";
import {
  decimalAdd,
  decimalDepuisLexeme,
  decimalEstNegatif,
  decimalSomme,
  formaterMontantDevise,
  formaterMontantEur,
  normaliserSigneAvoir,
} from "../dist/domain/index.js";

describe("decimalDepuisLexeme / decimalSomme (lexème au-delà de la précision Number)", () => {
  it("conserve tous les chiffres d'un lexème hors précision IEEE-754 à travers une somme", () => {
    const lexeme = "12345678901234567890.123456789";
    const valeur = decimalDepuisLexeme(lexeme);
    expect(valeur).not.toBeNull();
    expect(decimalSomme([valeur as string])).toBe(lexeme);
  });

  it("refuse une entrée non exploitable sans jamais retomber sur \"0\"", () => {
    expect(decimalDepuisLexeme("abc")).toBeNull();
    expect(decimalDepuisLexeme(42)).toBeNull();
    expect(decimalDepuisLexeme(null)).toBeNull();
    expect(decimalDepuisLexeme(" 1.2")).toBeNull();
  });

  it("liste vide ⇒ \"0\" (zéro d'agrégation, pas une donnée inconnue)", () => {
    expect(decimalSomme([])).toBe("0");
  });

  it("conserve la précision d'un prix unitaire fin, hors formaterMontantEur", () => {
    expect(decimalDepuisLexeme("0.000001")).toBe("0.000001");
    expect(decimalDepuisLexeme("1.23456")).toBe("1.23456");
  });
});

describe("formaterMontantEur (arrondi half-up en fin de calcul uniquement)", () => {
  it("decimalAdd conserve la précision ; formaterMontantEur arrondit à deux décimales", () => {
    expect(decimalAdd("0.10", "0.20")).toBe("0.3");
    expect(formaterMontantEur(decimalAdd("0.10", "0.20"))).toBe("0.30");
  });
});

describe("formaterMontantDevise (pas d'échelle présumée hors EUR)", () => {
  it("échelle null ⇒ valeur canonique inchangée", () => {
    expect(formaterMontantDevise("1.23456", null)).toBe("1.23456");
  });

  it("échelle fournie ⇒ arrondi half-up à cette échelle", () => {
    expect(formaterMontantDevise("1.235", 2)).toBe("1.24");
  });
});

describe("normaliserSigneAvoir (A01 : inversion au plus une fois)", () => {
  it("\"deja_negatif\" renvoie le montant tel quel, même négatif, de façon idempotente", () => {
    const premierPassage = normaliserSigneAvoir("-20.00", "deja_negatif");
    expect(decimalEstNegatif(premierPassage)).toBe(true);
    expect(normaliserSigneAvoir(premierPassage, "deja_negatif")).toBe(premierPassage);
  });

  it("\"positif_a_inverser\" n'inverse qu'une seule fois", () => {
    const inverse = normaliserSigneAvoir("20.00", "positif_a_inverser");
    expect(decimalEstNegatif(inverse)).toBe(true);
    expect(decimalAdd(inverse, "20.00")).toBe("0");
  });
});
