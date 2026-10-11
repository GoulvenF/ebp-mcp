import { describe, expect, it } from "vitest";
import { construireEnveloppe, construireEnveloppeContexte } from "../../../dist/index.js";
import type { ResultatService } from "../../../dist/index.js";

const EXTRAS = {
  mode: "mock" as const,
  observeA: "2026-01-01T00:00:01.000Z",
  dureeMs: 1000,
  appelsApi: 1,
  appelsAuth: 0,
  quotaJourRestant: 100,
  quotaUtilisable: 90,
  quotaEstime: true,
};

function resultatService(overrides: Partial<ResultatService<unknown>> = {}): ResultatService<unknown> {
  return {
    dossier: "d1",
    resultats: [{ id: "1" }],
    bruts: null,
    pagination: null,
    completude: "complete",
    raison_arret: null,
    approximatif: false,
    avertissements: [],
    sources: ["source:/test"],
    appels_source: 1,
    tentatives: 1,
    ...overrides,
  };
}

describe("construireEnveloppe — D-T12-3/D-T12-7", () => {
  it("brut absent si inclure_brut: false (resultat.bruts === null)", () => {
    const enveloppe = construireEnveloppe(resultatService({ bruts: null }), EXTRAS);
    expect(enveloppe).not.toHaveProperty("bruts");
  });

  it("brut aligné 1:1 sur resultats quand inclure_brut: true", () => {
    const enveloppe = construireEnveloppe(resultatService({ resultats: [{ id: "1" }, { id: "2" }], bruts: ["b1", "b2"] }), EXTRAS);
    expect(enveloppe.bruts).toEqual(["b1", "b2"]);
    expect(enveloppe.bruts).toHaveLength(enveloppe.resultats.length);
  });

  it("brut au-delà de 1 Mio : bruts: null avec avertissement", () => {
    const gros = "x".repeat(2 * 1024 * 1024);
    const enveloppe = construireEnveloppe(resultatService({ bruts: [gros] }), EXTRAS);
    expect(enveloppe.bruts).toBeNull();
    expect(enveloppe.meta.avertissements).toContain("brut omis : plafond 1 Mio");
  });

  it("meta reprend mode/observe_a/duree_ms/quota_* de l'exécution, et approximatif/completude/sources du service", () => {
    const enveloppe = construireEnveloppe(resultatService({ approximatif: true, completude: "partielle", raison_arret: "budget" }), EXTRAS);
    expect(enveloppe.meta.mode).toBe("mock");
    expect(enveloppe.meta.observe_a).toBe(EXTRAS.observeA);
    expect(enveloppe.meta.duree_ms).toBe(1000);
    expect(enveloppe.meta.quota_jour_restant).toBe(100);
    expect(enveloppe.meta.approximatif).toBe(true);
    expect(enveloppe.meta.completude).toBe("partielle");
    expect(enveloppe.meta.raison_arret).toBe("budget");
  });
});

describe("construireEnveloppeContexte — outils de contexte globaux", () => {
  it("dossier: null, resultats à 0 ou 1 objet, pagination: null, jamais de brut", () => {
    const enveloppe = construireEnveloppeContexte(null, { statut: "ok" }, EXTRAS);
    expect(enveloppe.dossier).toBeNull();
    expect(enveloppe.resultats).toEqual([{ statut: "ok" }]);
    expect(enveloppe.pagination).toBeNull();
    expect(enveloppe).not.toHaveProperty("bruts");
  });

  it("resultat null donne resultats: []", () => {
    const enveloppe = construireEnveloppeContexte(null, null, EXTRAS);
    expect(enveloppe.resultats).toEqual([]);
  });
});
