import { describe, expect, it } from "vitest";
import { balanceComptes } from "../../../dist/index.js";
import { contexteServiceCompta, depsServiceDe, ligneBrute } from "./fixtures-balance.js";

const PERIODE = { du: "2026-01-01", au: "2026-01-31" };

/** Un seul appel transport, renvoyant `linesEntries` ; `renvoyes < 100` ⇒ dernière page (une seule requête). */
function pageUnique(elements: unknown[]) {
  return [{ status: 200, corps: { linesEntries: elements } }];
}

describe("balance.ts — balance_comptes, exemple 07 §8 (D=150, C=40)", () => {
  it("solde 110, solde_debiteur 110, solde_crediteur 0 ; compte créditeur symétrique", async () => {
    const elements = [
      ligneBrute({ generalAccount: "411000", debit: "150.00", credit: null }),
      ligneBrute({ generalAccount: "411000", debit: null, credit: "40.00" }),
      ligneBrute({ generalAccount: "401000", debit: "40.00", credit: null }),
      ligneBrute({ generalAccount: "401000", debit: null, credit: "150.00" }),
    ];
    const deps = depsServiceDe(pageUnique(elements));
    const ctx = contexteServiceCompta();

    const resultat = await balanceComptes(deps, ctx, PERIODE);

    expect(resultat.resultats).toHaveLength(1);
    const balance = resultat.resultats[0]!;
    expect(balance.comptes).toEqual([
      {
        compte: "401000",
        debit: "40",
        credit: "150",
        solde: "-110",
        solde_debiteur: "0",
        solde_crediteur: "110",
        devise: null,
        lignes: 2,
        incomplet: false,
      },
      {
        compte: "411000",
        debit: "150",
        credit: "40",
        solde: "110",
        solde_debiteur: "110",
        solde_crediteur: "0",
        devise: null,
        lignes: 2,
        incomplet: false,
      },
    ]);
    expect(deps.transport.appels).toHaveLength(1);
  });
});

describe("balance.ts — précision décimale, aucun arrondi", () => {
  it("0.1 + 0.2 = 0.3 exactement (jamais 0.30000000000000004 d'une somme flottante)", async () => {
    const elements = [
      ligneBrute({ generalAccount: "411000", debit: "0.1", credit: null }),
      ligneBrute({ generalAccount: "411000", debit: "0.2", credit: null }),
    ];
    const deps = depsServiceDe(pageUnique(elements));
    const resultat = await balanceComptes(deps, contexteServiceCompta(), PERIODE);
    expect(resultat.resultats[0]!.comptes[0]!.debit).toBe("0.3");
  });

  it("sommes de montants à 4 décimales sans perte, aucun arrondi", async () => {
    const elements = [
      ligneBrute({ generalAccount: "411000", debit: "10.1234", credit: null }),
      ligneBrute({ generalAccount: "411000", debit: "0.0001", credit: null }),
      ligneBrute({ generalAccount: "411000", debit: null, credit: "5.0005" }),
      ligneBrute({ generalAccount: "411000", debit: null, credit: "4.9995" }),
    ];
    const deps = depsServiceDe(pageUnique(elements));
    const resultat = await balanceComptes(deps, contexteServiceCompta(), PERIODE);
    const compte = resultat.resultats[0]!.comptes[0]!;
    expect(compte.debit).toBe("10.1235");
    expect(compte.credit).toBe("10");
    expect(compte.solde).toBe("0.1235");
    expect(compte.solde_debiteur).toBe("0.1235");
    expect(compte.solde_crediteur).toBe("0");
  });
});

describe("balance.ts — D-T11-11, filtre `classe`", () => {
  it("ne garde que les comptes dont le premier caractère est ce chiffre", async () => {
    const elements = [
      ligneBrute({ generalAccount: "410000", debit: "10", credit: null }),
      ligneBrute({ generalAccount: "420000", debit: "10", credit: null }),
      ligneBrute({ generalAccount: "512000", debit: "10", credit: null }),
    ];
    const deps = depsServiceDe(pageUnique(elements));
    const resultat = await balanceComptes(deps, contexteServiceCompta(), { ...PERIODE, classe: "4" });
    const balance = resultat.resultats[0]!;
    expect(balance.comptes.map((c) => c.compte)).toEqual(["410000", "420000"]);
    expect(balance.lignes_parcourues).toBe(2);
    expect(balance.perimetre).toEqual({ classe: "4", comptes: null, statuts: "tous les statuts retournés par la source" });
  });
});

describe("balance.ts — D-T11-11, filtre `comptes[]` en égalité exacte", () => {
  it("`411` ne correspond pas à `411000`", async () => {
    const elements = [
      ligneBrute({ generalAccount: "411", debit: "10", credit: null }),
      ligneBrute({ generalAccount: "411000", debit: "10", credit: null }),
    ];
    const deps = depsServiceDe(pageUnique(elements));
    const resultat = await balanceComptes(deps, contexteServiceCompta(), { ...PERIODE, comptes: ["411"] });
    const balance = resultat.resultats[0]!;
    expect(balance.comptes.map((c) => c.compte)).toEqual(["411"]);
    expect(balance.lignes_parcourues).toBe(1);
  });
});

describe("balance.ts — D-T11-11, `classe` et `comptes` exclusifs", () => {
  it("les deux fournis ensemble ⇒ INVALID_ARGUMENT avant tout réseau", async () => {
    const deps = depsServiceDe([]);
    await expect(
      balanceComptes(deps, contexteServiceCompta(), { ...PERIODE, classe: "4", comptes: ["411000"] }),
    ).rejects.toMatchObject({ erreur: { code: "INVALID_ARGUMENT" } });
    expect(deps.transport.appels).toHaveLength(0);
  });
});

describe("balance.ts — D-T11-12, côté inutilisé", () => {
  it("un côté `null` et l'autre décimal : le côté `null` ne contribue pas, compte non incomplet", async () => {
    const elements = [ligneBrute({ generalAccount: "411000", debit: "100", credit: null })];
    const deps = depsServiceDe(pageUnique(elements));
    const resultat = await balanceComptes(deps, contexteServiceCompta(), PERIODE);
    const compte = resultat.resultats[0]!.comptes[0]!;
    expect(compte).toMatchObject({ debit: "100", credit: "0", incomplet: false, lignes: 1 });
    expect(resultat.completude).toBe("complete");
    expect(resultat.approximatif).toBe(false);
  });
});

describe("balance.ts — D-T11-12, deux côtés `null` ⇒ ligne exclue", () => {
  it("compte `incomplet`, résultat `approximatif`, `completude: partielle`", async () => {
    const elements = [
      ligneBrute({ generalAccount: "411000", debit: "50", credit: null }),
      ligneBrute({ generalAccount: "411000", debit: null, credit: null }),
    ];
    const deps = depsServiceDe(pageUnique(elements));
    const resultat = await balanceComptes(deps, contexteServiceCompta(), PERIODE);
    const balance = resultat.resultats[0]!;
    expect(balance.comptes[0]).toMatchObject({ compte: "411000", debit: "50", credit: "0", solde: "50", lignes: 2, incomplet: true });
    expect(balance.lignes_parcourues).toBe(2);
    expect(balance.lignes_exclues).toBe(1);
    expect(resultat.approximatif).toBe(true);
    expect(resultat.completude).toBe("partielle");
    expect(resultat.raison_arret).toBe("source_incomplete");
    expect(resultat.avertissements.some((a) => a.includes("exclue"))).toBe(true);
  });
});

describe("balance.ts — D-T11-12, budget épuisé à la 2e page", () => {
  it("totaux sur les lignes parcourues, `lignes_parcourues` exact, `completude: partielle`, `raison_arret: budget`", async () => {
    const pageComplete = Array.from({ length: 100 }, (_, i) =>
      ligneBrute({ generalAccount: "411000", debit: "1", credit: null, piece: `P${i}` }),
    );
    const deps = depsServiceDe(pageUnique(pageComplete));
    const resultat = await balanceComptes(deps, contexteServiceCompta({ budgetRestant: 1 }), PERIODE);
    const balance = resultat.resultats[0]!;
    expect(balance.lignes_parcourues).toBe(100);
    expect(resultat.completude).toBe("partielle");
    expect(resultat.raison_arret).toBe("budget");
    expect(resultat.approximatif).toBe(true);
    expect(resultat.avertissements.some((a) => a.toLowerCase().includes("budget"))).toBe(true);
    expect(deps.transport.appels).toHaveLength(1);
  });
});

describe("balance.ts — aucune affirmation d'équilibre ou d'exhaustivité", () => {
  it("le résultat ne porte aucun champ ni avertissement affirmant un équilibre ou une exhaustivité, pas de somme de soldes absolus", async () => {
    const elements = [
      ligneBrute({ generalAccount: "411000", debit: "150", credit: null }),
      ligneBrute({ generalAccount: "401000", debit: null, credit: "150" }),
    ];
    const deps = depsServiceDe(pageUnique(elements));
    const resultat = await balanceComptes(deps, contexteServiceCompta(), PERIODE);
    const balance = resultat.resultats[0]!;
    expect(Object.keys(balance).sort()).toEqual(
      ["au", "comptes", "devise", "du", "lignes_exclues", "lignes_parcourues", "perimetre"].sort(),
    );
    for (const compte of balance.comptes) {
      expect(Object.keys(compte).sort()).toEqual(
        ["compte", "credit", "debit", "devise", "incomplet", "lignes", "solde", "solde_crediteur", "solde_debiteur"].sort(),
      );
    }
    const texteComplet = JSON.stringify(resultat).toLowerCase();
    expect(texteComplet).not.toContain("equilibre");
    expect(texteComplet).not.toContain("équilibr");
    expect(texteComplet).not.toContain("exhaustif");
  });
});

describe("balance.ts — périmètre et devise déclarés", () => {
  it("`statuts` déclare tous les statuts retournés par la source ; `devise: null` + avertissement dédié", async () => {
    const deps = depsServiceDe(pageUnique([]));
    const resultat = await balanceComptes(deps, contexteServiceCompta(), PERIODE);
    const balance = resultat.resultats[0]!;
    expect(balance.perimetre.statuts).toBe("tous les statuts retournés par la source");
    expect(balance.devise).toBeNull();
    expect(resultat.avertissements.some((a) => a.toLowerCase().includes("devise"))).toBe(true);
  });
});

describe("balance.ts — D-T11-1/D-T11-6, dossier GesCom", () => {
  it("⇒ UNSUPPORTED_CAPABILITY, 0 appel transport", async () => {
    const deps = depsServiceDe([]);
    const ctx = contexteServiceCompta({ famille: "hubbix-gescom" });
    await expect(balanceComptes(deps, ctx, PERIODE)).rejects.toMatchObject({ erreur: { code: "UNSUPPORTED_CAPABILITY" } });
    expect(deps.transport.appels).toHaveLength(0);
  });
});

describe("balance.ts — D-T11-14, `inclure_brut`", () => {
  it("`inclure_brut: true` ⇒ `bruts: null` + avertissement dédié", async () => {
    const deps = depsServiceDe(pageUnique([]));
    const resultat = await balanceComptes(deps, contexteServiceCompta(), { ...PERIODE, inclure_brut: true });
    expect(resultat.bruts).toBeNull();
    expect(resultat.avertissements.some((a) => a.includes("inclure_brut"))).toBe(true);
  });
});

describe("balance.ts — montant invalide signalé par l'adapter (un seul côté illisible)", () => {
  it("`debit: \"abc\", credit: \"10\"` ⇒ résultat approximatif, partielle, source_incomplete, avertissement dédié", async () => {
    const elements = [
      ligneBrute({ generalAccount: "411000", debit: "abc", credit: "10" }),
      ligneBrute({ generalAccount: "411000", debit: "50", credit: null }),
    ];
    const deps = depsServiceDe(pageUnique(elements));
    const resultat = await balanceComptes(deps, contexteServiceCompta(), PERIODE);
    const balance = resultat.resultats[0]!;
    // Le débit illisible est réduit à `null` par l'adapter ; en l'absence d'attribution exacte
    // (D-T11-14/GOU-337), le crédit "10" est quand même additionné : la dégradation est globale.
    const compte = balance.comptes[0]!;
    expect(compte.debit).toBe("50");
    expect(compte.credit).toBe("10");
    expect(resultat.approximatif).toBe(true);
    expect(resultat.completude).toBe("partielle");
    expect(resultat.raison_arret).toBe("source_incomplete");
    expect(
      resultat.avertissements.some((a) => a.includes("Montant illisible signalé par la source")),
    ).toBe(true);
  });
});

describe("balance.ts — D-T11-5, revérification locale de la période", () => {
  it("date hors [du, au] renvoyée par la source ⇒ écartée des totaux, comptée, avertissement, sans dégrader la complétude", async () => {
    const elements = [
      ligneBrute({ generalAccount: "411000", entry: { journal: "VE", date: "2025-12-31", entryMode: "Validé" }, debit: "100", credit: null }),
      ligneBrute({ generalAccount: "411000", debit: "50", credit: null }),
    ];
    const deps = depsServiceDe(pageUnique(elements));
    const resultat = await balanceComptes(deps, contexteServiceCompta(), PERIODE);
    const balance = resultat.resultats[0]!;
    expect(balance.comptes).toEqual([
      {
        compte: "411000",
        debit: "50",
        credit: "0",
        solde: "50",
        solde_debiteur: "50",
        solde_crediteur: "0",
        devise: null,
        lignes: 1,
        incomplet: false,
      },
    ]);
    expect(balance.lignes_exclues).toBe(1);
    expect(resultat.approximatif).toBe(true);
    expect(resultat.completude).toBe("complete");
    expect(resultat.avertissements.some((a) => a.includes("hors période"))).toBe(true);
  });

  it("date `null` ⇒ écartée des totaux, comptée, approximatif, `completude: partielle`, `raison_arret: source_incomplete`", async () => {
    const elements = [
      ligneBrute({ generalAccount: "411000", entry: { journal: "VE", date: null, entryMode: "Validé" }, debit: "100", credit: null }),
      ligneBrute({ generalAccount: "411000", debit: "50", credit: null }),
    ];
    const deps = depsServiceDe(pageUnique(elements));
    const resultat = await balanceComptes(deps, contexteServiceCompta(), PERIODE);
    const balance = resultat.resultats[0]!;
    expect(balance.comptes).toEqual([
      {
        compte: "411000",
        debit: "50",
        credit: "0",
        solde: "50",
        solde_debiteur: "50",
        solde_crediteur: "0",
        devise: null,
        lignes: 1,
        incomplet: false,
      },
    ]);
    expect(balance.lignes_exclues).toBe(1);
    expect(resultat.approximatif).toBe(true);
    expect(resultat.completude).toBe("partielle");
    expect(resultat.raison_arret).toBe("source_incomplete");
  });
});

describe("balance.ts — `pagination`, toujours `null` (agrégat)", () => {
  it("jamais de pagination pour un agrégat", async () => {
    const deps = depsServiceDe(pageUnique([]));
    const resultat = await balanceComptes(deps, contexteServiceCompta(), PERIODE);
    expect(resultat.pagination).toBeNull();
  });
});
