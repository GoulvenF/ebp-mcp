import { describe, expect, it } from "vitest";
import { listerEcritures } from "../../../dist/index.js";
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

describe("lister_ecritures (D-T11-5)", () => {
  it("dossier GC ⇒ UNSUPPORTED_CAPABILITY, 0 appel transport", async () => {
    const deps = depsDe([]);
    await expect(listerEcritures(deps, ctxGcDe(), {})).rejects.toMatchObject({
      erreur: { code: "UNSUPPORTED_CAPABILITY" },
    });
    expect(deps.transport.appels).toHaveLength(0);
  });

  it("n'envoie que startDate/endDate/generalAccount/auxiliaryAccount/valid/lettered, jamais journals/search/nature/tri", async () => {
    const deps = depsDe([{ status: 200, corps: { linesEntries: [ligne()], take: 50, skip: 0 } }]);
    await listerEcritures(deps, ctxDe(), {
      du: "2026-03-01",
      au: "2026-03-31",
      compte: "411000",
      compte_tiers: "4010001",
      validees: true,
      lettrees: false,
      journaux: ["VE"],
      texte: "vente",
    });
    const url = deps.transport.appels[0]!.url;
    expect(url).toContain("startDate");
    expect(url).toContain("endDate");
    expect(url).toContain("generalAccount");
    expect(url).toContain("auxiliaryAccount");
    expect(url).toContain("valid");
    expect(url).toContain("lettered");
    expect(url).not.toContain("journals");
    expect(url).not.toContain("search");
    expect(url).not.toContain("nature");
    expect(url).not.toContain("sort");
  });

  it("revérification locale écarte une ligne `411000` quand `compte = \"411\"` (égalité exacte)", async () => {
    const deps = depsDe([
      {
        status: 200,
        corps: {
          linesEntries: [ligne({ generalAccount: "411000" }), ligne({ generalAccount: "411", piece: "FA-411" })],
          take: 50,
          skip: 0,
        },
      },
    ]);
    const resultat = await listerEcritures(deps, ctxDe(), { compte: "411" });
    expect(resultat.resultats).toHaveLength(1);
    expect(resultat.resultats[0]!.piece).toBe("FA-411");
  });

  it("`journaux[]` filtre localement, jamais envoyé en paramètre serveur", async () => {
    const deps = depsDe([
      {
        status: 200,
        corps: {
          linesEntries: [ligne({ entry: { journal: "VE", date: "2026-03-05", entryMode: "Validé" } }), ligne({ entry: { journal: "AC", date: "2026-03-06", entryMode: "Validé" } })],
          take: 50,
          skip: 0,
        },
      },
    ]);
    const resultat = await listerEcritures(deps, ctxDe(), { journaux: ["VE"] });
    expect(resultat.resultats).toHaveLength(1);
    expect(resultat.resultats[0]!.journal).toBe("VE");
    expect(deps.transport.appels[0]!.url).not.toContain("journals");
  });

  it("ligne avec `date: null` exclue avec avertissement quand `du`/`au` fournis", async () => {
    const deps = depsDe([
      {
        status: 200,
        corps: {
          linesEntries: [ligne({ entry: { journal: "VE", date: null, entryMode: "Validé" } })],
          take: 50,
          skip: 0,
        },
      },
    ]);
    const resultat = await listerEcritures(deps, ctxDe(), { du: "2026-03-01", au: "2026-03-31" });
    expect(resultat.resultats).toHaveLength(0);
    expect(resultat.avertissements.some((a) => a.includes("date absente"))).toBe(true);
  });

  it("renvoie des lignes `LigneEcritureListe` (pas de regroupement par écriture)", async () => {
    const deps = depsDe([{ status: 200, corps: { linesEntries: [ligne()], take: 50, skip: 0 } }]);
    const resultat = await listerEcritures(deps, ctxDe(), {});
    expect(resultat.resultats[0]).toMatchObject({ compte_general: "411000", libelle: "Vente mars" });
  });
});
