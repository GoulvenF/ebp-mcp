import { describe, expect, it } from "vitest";
import { estOrigineIdentiteAutorisee, HOTE_IDENTITE, hoteIdentite, urlAutorize, urlToken } from "../../dist/index.js";

describe("origines.ts", () => {
  it("l'hôte identité est le même pour prod et preprod (décision 1, 02 §1)", () => {
    expect(hoteIdentite("prod")).toBe(HOTE_IDENTITE);
    expect(hoteIdentite("preprod")).toBe(HOTE_IDENTITE);
  });

  it("urlAutorize et urlToken utilisent les chemins /connect/authorize et /connect/token", () => {
    expect(urlAutorize("prod")).toBe(`${HOTE_IDENTITE}/connect/authorize`);
    expect(urlToken("preprod")).toBe(`${HOTE_IDENTITE}/connect/token`);
  });

  it("estOrigineIdentiteAutorisee accepte exactement l'hôte identité", () => {
    expect(estOrigineIdentiteAutorisee(`${HOTE_IDENTITE}/connect/token`)).toBe(true);
    expect(estOrigineIdentiteAutorisee("https://api-login.ebp.com:8443/connect/token")).toBe(false);
    expect(estOrigineIdentiteAutorisee("https://autre-hote.ebp.com/connect/token")).toBe(false);
    expect(estOrigineIdentiteAutorisee("http://api-login.ebp.com/connect/token")).toBe(false);
    expect(estOrigineIdentiteAutorisee("pas-une-url")).toBe(false);
  });
});
