import { describe, expect, it } from "vitest";
import {
  lireEnveloppeData,
  lireEnveloppeLinesEntries,
  lireEnveloppeTableauNuCompta,
  lireFicheCompta,
} from "../../../dist/index.js";

describe("compta/enveloppe.ts — un wrapper par route, reconnu structurellement (D-T09-7)", () => {
  it("`lireEnveloppeData` : tableau `data` lu, `totalRecords` absent ⇒ total null", () => {
    const resultat = lireEnveloppeData("route-test", { data: [1, 2] });
    expect(resultat.elements).toEqual([1, 2]);
    expect(resultat.totalSource).toBeNull();
  });

  it("`lireEnveloppeData` : `{linesEntries:[...]}` jamais lu comme `data`", () => {
    expect(() => lireEnveloppeData("route-test", { linesEntries: [] })).toThrowError();
  });

  it("`lireEnveloppeData` : tableau nu jamais lu comme `data`", () => {
    expect(() => lireEnveloppeData("route-test", [])).toThrowError();
  });

  it("`lireEnveloppeLinesEntries` : `{data:[...]}` jamais lu comme `linesEntries`", () => {
    expect(() => lireEnveloppeLinesEntries("route-test", { data: [] })).toThrowError();
  });

  it("`lireEnveloppeLinesEntries` : tableau nu jamais lu comme `linesEntries`", () => {
    expect(() => lireEnveloppeLinesEntries("route-test", [])).toThrowError();
  });

  it("`lireEnveloppeTableauNuCompta` : `{data:[...]}` jamais lu comme tableau nu", () => {
    expect(() => lireEnveloppeTableauNuCompta("route-test", { data: [] })).toThrowError();
  });

  it("`lireFicheCompta` : tableau jamais lu comme fiche", () => {
    expect(() => lireFicheCompta("route-test", [])).toThrowError();
  });

  it("`lireFicheCompta` : scalaire jamais lu comme fiche", () => {
    expect(() => lireFicheCompta("route-test", "texte")).toThrowError();
  });
});
