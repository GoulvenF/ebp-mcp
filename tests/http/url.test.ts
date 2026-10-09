import { describe, expect, it } from "vitest";
import { construireChemin, construireQuery, trouverRoute } from "../../dist/index.js";
import type { EntreeRegistre } from "../../dist/index.js";

const routeAvecSegment = trouverRoute("cpt-auxiliary-account-detail") as EntreeRegistre;
const routeAvecQuery = trouverRoute("cpt-auxiliary-accounts") as EntreeRegistre;

describe("url.ts — critère #14 : encodage", () => {
  it("segment simple (numéro de compte auxiliaire)", () => {
    expect(construireChemin(routeAvecSegment, { numero: "C0000001" })).toBe("/auxiliary-accounts/C0000001");
  });

  it("segment UUID", () => {
    const route = trouverRoute("cpt-entry-detail") as EntreeRegistre;
    const uuid = "8f14e45f-ceea-4e14-9d3a-2e3f3f6a1b2c";
    expect(construireChemin(route, { uuid })).toBe(`/entries/${uuid}`);
  });

  it("segment contenant des accents : encodé, jamais normalisé", () => {
    expect(construireChemin(routeAvecSegment, { numero: "Clémence" })).toBe(
      `/auxiliary-accounts/${encodeURIComponent("Clémence")}`,
    );
  });

  it("segment contenant '/' refusé", () => {
    expect(() => construireChemin(routeAvecSegment, { numero: "a/b" })).toThrow();
  });

  it("segment '..' refusé", () => {
    expect(() => construireChemin(routeAvecSegment, { numero: ".." })).toThrow();
  });

  it("segment vide refusé", () => {
    expect(() => construireChemin(routeAvecSegment, { numero: "" })).toThrow();
  });

  it("query triée par clé, ordre stable indépendant de l'ordre d'insertion", () => {
    const q1 = construireQuery(routeAvecQuery, { take: 50, skip: 0, search: "x" });
    const q2 = construireQuery(routeAvecQuery, { search: "x", skip: 0, take: 50 });
    expect(q1.toString()).toBe(q2.toString());
    expect(q1.toString()).toBe("search=x&skip=0&take=50");
  });

  it("paramètre non déclaré refusé avant réseau", () => {
    expect(() => construireQuery(routeAvecQuery, { category: "C" })).toThrow();
  });
});
