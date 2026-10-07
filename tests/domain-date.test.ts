import { afterEach, describe, expect, it } from "vitest";
import {
  aujourdHuiParis,
  dureeInclusiveJours,
  estDateCivile,
  estEnRetard,
  joursCivilsEntre,
  joursRetard,
  validerIntervalle,
} from "../dist/domain/index.js";
import type { Clock } from "../dist/ports/index.js";

function horlogeFigee(instantIso: string): Clock {
  return {
    now: () => new Date(instantIso),
    wait: async () => {
      /* non utilisé par ces tests */
    },
  };
}

describe("estDateCivile (strict, 29 février)", () => {
  it("accepte une année bissextile et rejette les formats ambigus", () => {
    expect(estDateCivile("2024-02-29")).toBe(true);
    expect(estDateCivile("2025-02-29")).toBe(false);
    expect(estDateCivile("2026-13-01")).toBe(false);
    expect(estDateCivile("2026-02-30")).toBe(false);
    expect(estDateCivile("2026-1-1")).toBe(false);
    expect(estDateCivile("2026-02-29T00:00:00Z")).toBe(false);
    expect(estDateCivile(" 2026-02-01")).toBe(false);
  });
});

describe("dureeInclusiveJours (A10)", () => {
  it("un seul jour vaut 1", () => {
    expect(dureeInclusiveJours("2026-03-02", "2026-03-02")).toBe(1);
  });
});

describe("validerIntervalle", () => {
  it("refuse une fenêtre négative", () => {
    expect(validerIntervalle({ du: "2026-03-10", au: "2026-03-01" })).toEqual({
      ok: false,
      code: "INVALID_ARGUMENT",
      message: expect.any(String),
    });
  });

  it("accepte du <= au", () => {
    expect(validerIntervalle({ du: "2026-03-01", au: "2026-03-01" })).toEqual({ ok: true });
  });
});

describe("joursCivilsEntre / dureeInclusiveJours insensibles au fuseau et au passage heure d'été", () => {
  const casTemoin = { du: "2026-03-01", au: "2026-03-03" };
  const casPrintemps = { du: "2026-03-28", au: "2026-03-30" };
  const casAutomne = { du: "2026-10-24", au: "2026-10-26" };

  const tzOriginal = process.env.TZ;
  afterEach(() => {
    process.env.TZ = tzOriginal;
  });

  it.each([["Europe/Paris"], ["Pacific/Kiritimati"]])("donne le même résultat sous TZ=%s", (tz) => {
    process.env.TZ = tz;
    expect(joursCivilsEntre(casPrintemps.du, casPrintemps.au)).toBe(
      joursCivilsEntre(casTemoin.du, casTemoin.au),
    );
    expect(joursCivilsEntre(casAutomne.du, casAutomne.au)).toBe(
      joursCivilsEntre(casTemoin.du, casTemoin.au),
    );
    expect(dureeInclusiveJours(casPrintemps.du, casPrintemps.au)).toBe(
      dureeInclusiveJours(casTemoin.du, casTemoin.au),
    );
    expect(dureeInclusiveJours(casAutomne.du, casAutomne.au)).toBe(
      dureeInclusiveJours(casTemoin.du, casTemoin.au),
    );
  });
});

describe("aujourdHuiParis (horloge injectée, aucun Date.now direct)", () => {
  it("23:30 UTC un 28 mars (CET) retombe sur le 29 mars Europe/Paris", () => {
    expect(aujourdHuiParis(horlogeFigee("2026-03-28T23:30:00Z"))).toBe("2026-03-29");
  });

  it("23:30 UTC le 1er janvier retombe sur le 2 janvier Europe/Paris", () => {
    expect(aujourdHuiParis(horlogeFigee("2026-01-01T23:30:00Z"))).toBe("2026-01-02");
  });
});

describe("joursRetard / estEnRetard (07 §8 : absence ⇒ null, jamais 0/false)", () => {
  it("échéance du jour n'est pas en retard", () => {
    expect(joursRetard("2026-03-10", "2026-03-10")).toBe(0);
    expect(estEnRetard("100.00", "2026-03-10", "2026-03-10")).toBe(false);
  });

  it("échéance absente ⇒ null des deux côtés", () => {
    expect(joursRetard("2026-03-10", null)).toBeNull();
    expect(estEnRetard("100.00", null, "2026-03-10")).toBeNull();
  });

  it("reste dû null ⇒ estEnRetard null, même avec échéance dépassée", () => {
    expect(estEnRetard(null, "2026-01-01", "2026-03-10")).toBeNull();
  });

  it("reste dû positif et échéance dépassée ⇒ en retard", () => {
    expect(joursRetard("2026-03-10", "2026-03-01")).toBe(9);
    expect(estEnRetard("50.00", "2026-03-01", "2026-03-10")).toBe(true);
  });
});
