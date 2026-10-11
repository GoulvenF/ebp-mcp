import { describe, expect, it } from "vitest";
import { exercices } from "../../../dist/index.js";
import { ctxDe, ctxGcDe, depsDe } from "./fixtures.js";

const FOLDER_SETTINGS = {
  exercices: [{ startDate: "2026-01-01", endDate: "2026-12-31", exerciceNumber: 1, closingDate: null }],
  entry: { mode: "Provisoire" },
};

describe("exercices (D-T11-16)", () => {
  it("dossier GC ⇒ UNSUPPORTED_CAPABILITY, 0 appel transport", async () => {
    const deps = depsDe([]);
    await expect(exercices(deps, ctxGcDe(), {})).rejects.toMatchObject({
      erreur: { code: "UNSUPPORTED_CAPABILITY" },
    });
    expect(deps.transport.appels).toHaveLength(0);
  });

  it("`resultats: [{exercices}]`, `pagination: null`", async () => {
    const deps = depsDe([{ status: 200, corps: FOLDER_SETTINGS }]);
    const resultat = await exercices(deps, ctxDe(), {});
    expect(resultat.resultats).toHaveLength(1);
    expect(resultat.resultats[0]).toHaveProperty("exercices");
    expect(Array.isArray(resultat.resultats[0]!.exercices)).toBe(true);
    expect(resultat.pagination).toBeNull();
  });

  it("`inclure_brut: true` ⇒ bruts aligné 1:1", async () => {
    const deps = depsDe([{ status: 200, corps: FOLDER_SETTINGS }]);
    const resultat = await exercices(deps, ctxDe(), { inclure_brut: true });
    expect(resultat.bruts).toHaveLength(1);
  });

  it("`inclure_brut: false` (défaut) ⇒ bruts null", async () => {
    const deps = depsDe([{ status: 200, corps: FOLDER_SETTINGS }]);
    const resultat = await exercices(deps, ctxDe(), {});
    expect(resultat.bruts).toBeNull();
  });
});
