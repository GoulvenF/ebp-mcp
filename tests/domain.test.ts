import { describe, expect, it } from "vitest";
import {
  CODES_ERREUR,
  decimalAdd,
  decimalCompare,
  decimalRoundHalfUp,
  isValidDecimalString,
} from "../dist/domain/index.js";

describe("domain decimal (big.js, configuré une seule fois dans src/domain)", () => {
  it("additionne deux chaînes décimales canoniques sans dérive flottante", () => {
    expect(decimalAdd("0.10", "0.20")).toBe("0.3");
  });

  it("arrondit half-up à l'opposé de zéro pour un négatif (convention D09)", () => {
    expect(decimalRoundHalfUp("-2.345", 2)).toBe("-2.35");
    expect(decimalRoundHalfUp("2.345", 2)).toBe("2.35");
  });

  it("compare deux chaînes décimales", () => {
    expect(decimalCompare("80.00", "80")).toBe(0);
    expect(decimalCompare("40", "150")).toBe(-1);
  });

  it("rejette une entrée non interprétable plutôt que de retomber sur zéro", () => {
    expect(isValidDecimalString("abc")).toBe(false);
    expect(isValidDecimalString("")).toBe(false);
    expect(isValidDecimalString("12345678901234567890.123456789")).toBe(true);
  });
});

describe("codes d'erreur stables (07 §7)", () => {
  it("expose exactement les 19 codes attendus, sans doublon", () => {
    expect(CODES_ERREUR.length).toBe(19);
    expect(new Set(CODES_ERREUR).size).toBe(19);
    expect(CODES_ERREUR).toContain("DOSSIER_REQUIRED");
    expect(CODES_ERREUR).toContain("PII_POLICY");
  });
});
