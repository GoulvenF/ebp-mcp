import { describe, expect, it } from "vitest";
import { determinerFormeEnveloppeReelle } from "../../dist/index.js";

describe("src/fixtures/manifeste.ts — determinerFormeEnveloppeReelle : signature positive de `fiche`", () => {
  it("objet sans `id`/`code`/`documentType` ⇒ forme non reconnue (`null`), jamais un repli silencieux sur `fiche`", () => {
    expect(determinerFormeEnveloppeReelle({ foo: "bar" })).toBeNull();
    expect(determinerFormeEnveloppeReelle({})).toBeNull();
  });

  it("présence de `code` (fiche client, sans `id`) ⇒ `fiche`", () => {
    expect(determinerFormeEnveloppeReelle({ code: "CLI001", name: "Client" })).toBe("fiche");
  });

  it("présence de `id` (fiche article) ⇒ `fiche`", () => {
    expect(determinerFormeEnveloppeReelle({ id: "art-1", code: "ART1" })).toBe("fiche");
  });

  it("présence de `documentType` (en-tête de détail document) ⇒ `fiche`", () => {
    expect(determinerFormeEnveloppeReelle({ documentType: "SaleInvoice", documentStatus: 0 })).toBe("fiche");
  });

  it("présence de `uuid` (fiche CPT : compte général, compte tiers, écriture) ⇒ `fiche` (D-T09-9)", () => {
    expect(determinerFormeEnveloppeReelle({ uuid: "cpt-1", number: "411000" })).toBe("fiche");
  });

  it("présence de `domainName` (`/domain-information`) ⇒ `fiche` (D-T09-9)", () => {
    expect(determinerFormeEnveloppeReelle({ domainName: "Dossier", domainCode: "D1" })).toBe("fiche");
  });

  it("présence de `exercices` (`/folder-settings`) ⇒ `fiche` (D-T09-9)", () => {
    expect(determinerFormeEnveloppeReelle({ exercices: [], entry: {} })).toBe("fiche");
  });

  it("objet sans `id`/`code`/`documentType`/`uuid`/`domainName`/`exercices` ⇒ forme non reconnue (`null`) (D-T09-9)", () => {
    expect(determinerFormeEnveloppeReelle({ foo: "bar", number: "411000" })).toBeNull();
  });

  it("tableau nu, enveloppes `elements`/`data`/`linesEntries` et erreur restent prioritaires sur `fiche`", () => {
    expect(determinerFormeEnveloppeReelle([])).toBe("tableau_nu");
    expect(determinerFormeEnveloppeReelle({ elements: [], total: 0 })).toBe("elements");
    expect(determinerFormeEnveloppeReelle({ data: [], totalRecords: 0 })).toBe("data");
    expect(determinerFormeEnveloppeReelle({ linesEntries: [] })).toBe("linesEntries");
    expect(determinerFormeEnveloppeReelle({ status: 404, errorCode: "NotFound" })).toBe("erreur");
  });
});
