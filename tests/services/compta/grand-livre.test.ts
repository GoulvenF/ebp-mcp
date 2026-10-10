import { describe, expect, it } from "vitest";
import { grandLivre } from "../../../dist/index.js";
import { ctxDe, ctxGcDe, depsDe } from "./fixtures.js";

function ligne(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    entry: { journal: "VE", date: "2026-03-05", entryMode: "Validé" },
    generalAccount: "411000",
    auxiliaryAccount: null,
    label: "Vente mars",
    debit: "100.00",
    credit: null,
    piece: "FA2026-010",
    document: null,
    deadline: "2026-04-05",
    lettering: null,
    ...overrides,
  };
}

describe("grand_livre (D-T11-13)", () => {
  it("dossier GC ⇒ UNSUPPORTED_CAPABILITY, 0 appel transport", async () => {
    const deps = depsDe([]);
    await expect(
      grandLivre(deps, ctxGcDe(), { compte: "411000", du: "2026-03-01", au: "2026-03-31" }),
    ).rejects.toMatchObject({ erreur: { code: "UNSUPPORTED_CAPABILITY" } });
    expect(deps.transport.appels).toHaveLength(0);
  });

  it("aucun champ de cumul ou de solde dans une ligne rendue", async () => {
    const deps = depsDe([{ status: 200, corps: { linesEntries: [ligne()], take: 50, skip: 0 } }]);
    const resultat = await grandLivre(deps, ctxDe(), { compte: "411000", du: "2026-03-01", au: "2026-03-31" });
    expect(resultat.resultats).toHaveLength(1);
    const ligneRendue = resultat.resultats[0] as Record<string, unknown>;
    for (const champ of ["solde", "cumul", "solde_progressif", "solde_ouverture", "total"]) {
      expect(ligneRendue).not.toHaveProperty(champ);
    }
  });

  it("revérification exacte : écarte `411000` quand `compte = \"411\"`", async () => {
    const deps = depsDe([
      { status: 200, corps: { linesEntries: [ligne({ generalAccount: "411000" })], take: 50, skip: 0 } },
    ]);
    const resultat = await grandLivre(deps, ctxDe(), { compte: "411", du: "2026-03-01", au: "2026-03-31" });
    expect(resultat.resultats).toHaveLength(0);
  });

  it("ligne avec `date: null` exclue avec avertissement", async () => {
    const deps = depsDe([
      {
        status: 200,
        corps: { linesEntries: [ligne({ entry: { journal: "VE", date: null, entryMode: "Validé" } })], take: 50, skip: 0 },
      },
    ]);
    const resultat = await grandLivre(deps, ctxDe(), { compte: "411000", du: "2026-03-01", au: "2026-03-31" });
    expect(resultat.resultats).toHaveLength(0);
    expect(resultat.avertissements.some((a) => a.includes("date absente"))).toBe(true);
  });

  it("liste paginée (pas un agrégat) : `pagination` non nulle", async () => {
    const deps = depsDe([{ status: 200, corps: { linesEntries: [ligne()], take: 50, skip: 0 } }]);
    const resultat = await grandLivre(deps, ctxDe(), { compte: "411000", du: "2026-03-01", au: "2026-03-31" });
    expect(resultat.pagination).not.toBeNull();
  });
});
