import { describe, expect, it } from "vitest";
import { correspondTexte } from "../../../dist/index.js";

// "café" en forme NFC (é = U+00E9 composé) vs NFD ("e" U+0065 + accent combinant U+0301).
const CAFE_NFC = "café";
const CAFE_NFD = "café";

describe("texte.ts — critère : NFC vs NFD du même texte matchent", () => {
  it("aiguille en NFD trouvée dans un champ en NFC", () => {
    expect(correspondTexte(CAFE_NFD, [CAFE_NFC])).toBe(true);
  });
  it("aiguille en NFC trouvée dans un champ en NFD", () => {
    expect(correspondTexte(CAFE_NFC, [CAFE_NFD])).toBe(true);
  });
  it("les deux représentent bien des chaînes JS différentes avant normalisation", () => {
    expect(CAFE_NFC).not.toBe(CAFE_NFD);
    expect(CAFE_NFC.length).not.toBe(CAFE_NFD.length);
  });
});

describe("texte.ts — critère : insensibilité à la casse", () => {
  it("\"CAFÉ\" trouve \"café\"", () => {
    expect(correspondTexte("CAFÉ", ["café"])).toBe(true);
  });
  it("\"café\" trouve \"CAFÉ\"", () => {
    expect(correspondTexte("café", ["CAFÉ"])).toBe(true);
  });
});

describe("texte.ts — critère : pas de suppression d'accents (pas de fold)", () => {
  it("\"cafe\" (sans accent) ne matche PAS \"café\" (avec accent)", () => {
    expect(correspondTexte("cafe", ["café"])).toBe(false);
  });
  it("\"café\" ne matche pas \"cafe\" non accentué", () => {
    expect(correspondTexte("café", ["cafe"])).toBe(false);
  });
});

describe("texte.ts — critère : texte vide ou blanc lève erreurTexteVide / INVALID_ARGUMENT", () => {
  it("chaîne vide ⇒ lève", () => {
    expect(() => correspondTexte("", ["x"])).toThrowError();
    try {
      correspondTexte("", ["x"]);
    } catch (erreur) {
      expect(erreur).toMatchObject({ erreur: { code: "INVALID_ARGUMENT" } });
    }
  });
  it("chaîne composée uniquement d'espaces ⇒ lève", () => {
    expect(() => correspondTexte("   ", ["x"])).toThrowError();
  });
});

describe("texte.ts — critère : champs null/undefined ignorés, correspondance par inclusion", () => {
  it("champ null ignoré, champ suivant trouvé", () => {
    expect(correspondTexte("abc", [null, "xxabcxx"])).toBe(true);
  });
  it("champ undefined ignoré, aucun autre champ ne matche ⇒ false", () => {
    expect(correspondTexte("abc", [undefined, "zzz"])).toBe(false);
  });
  it("aucun champ ne contient l'aiguille ⇒ false", () => {
    expect(correspondTexte("introuvable", ["autre chose"])).toBe(false);
  });
});
