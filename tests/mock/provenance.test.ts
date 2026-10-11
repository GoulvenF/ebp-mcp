// Critère d'acceptation #8 (GOU-371, T13-1) : chaque module du jeu de données porte un en-tête de
// commentaire « synthétique », et aucun email hors `@example.invalid` n'apparaît nulle part dans le
// jeu de données réellement exporté par le barrel (`src/mock/donnees/index.ts`, celui que
// `creerTransportMock` consomme via `JEU_CPT_DEMO`/`JEU_GC_DEMO`).
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { JEU_CPT_DEMO, JEU_GC_DEMO } from "../../dist/index.js";

const repoRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));

// Les modules réellement exportés par le barrel (`src/mock/donnees/index.ts`) : `cpt.ts`/`gc.ts`.
// `compta.ts`/`gescom.ts` existent dans le répertoire mais ne sont réexportés par aucun barrel ni
// importés par `transport.ts` (voir le commentaire de clôture de l'issue T13-1 pour le constat) ;
// ils sont néanmoins vérifiés ici pour la provenance textuelle puisque le lot les a livrés.
const MODULES_DONNEES = ["cpt.ts", "gc.ts", "compta.ts", "gescom.ts"] as const;

function emailsDansTexte(texte: string): string[] {
  const motif = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
  return texte.match(motif) ?? [];
}

/** Parcourt récursivement un objet exporté et collecte toute chaîne ressemblant à un email. */
function emailsDansValeur(valeur: unknown, trouves: Set<string>): void {
  if (typeof valeur === "string") {
    for (const email of emailsDansTexte(valeur)) {
      trouves.add(email);
    }
    return;
  }
  if (Array.isArray(valeur)) {
    for (const element of valeur) emailsDansValeur(element, trouves);
    return;
  }
  if (valeur !== null && typeof valeur === "object") {
    for (const sousValeur of Object.values(valeur as Record<string, unknown>)) {
      emailsDansValeur(sousValeur, trouves);
    }
  }
}

describe("provenance du jeu de démonstration (D-T13-5, critère #8)", () => {
  it.each(MODULES_DONNEES)("`src/mock/donnees/%s` porte un en-tête de commentaire mentionnant « synthétique »", async (nom) => {
    const chemin = path.join(repoRoot, "src", "mock", "donnees", nom);
    const contenu = await readFile(chemin, "utf8");
    const enTete = contenu.slice(0, contenu.indexOf("*/") + 2);
    expect(enTete.toLowerCase()).toContain("synthétique");
  });

  it("aucun email hors `@example.invalid` n'apparaît dans `JEU_CPT_DEMO` (jeu réellement servi par le transport mock)", () => {
    const trouves = new Set<string>();
    emailsDansValeur(JEU_CPT_DEMO, trouves);
    expect(trouves.size).toBeGreaterThan(0); // au moins un email de démo existe (fiche tiers).
    for (const email of trouves) {
      expect(email.endsWith("@example.invalid")).toBe(true);
    }
  });

  it("aucun email hors `@example.invalid` n'apparaît dans `JEU_GC_DEMO`", () => {
    const trouves = new Set<string>();
    emailsDansValeur(JEU_GC_DEMO, trouves);
    for (const email of trouves) {
      expect(email.endsWith("@example.invalid")).toBe(true);
    }
  });
});
