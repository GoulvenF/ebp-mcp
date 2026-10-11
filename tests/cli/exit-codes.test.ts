// Table des codes de sortie (fiche T13-3, critère d'acceptation #1, D-T13-9) : un test par ligne
// de `TABLE_CODES_SORTIE`, écrit à la main depuis 07 §12 — jamais recopié d'une exécution.
import { describe, expect, it } from "vitest";
import { CODES_ERREUR } from "../../dist/domain/errors.js";
import { ErreurUsageCli, codeSortiePourErreur, ligneErreurCli } from "../../dist/cli/exit-codes.js";

const CODE_3 = new Set(["AUTH_REQUIRED"]);
const CODES_2 = new Set(["INVALID_ARGUMENT", "CONFIG_INVALID", "DOSSIER_REQUIRED", "DOSSIER_UNKNOWN"]);

function erreurDomaine(code: string): Error & { erreur: unknown } {
  const e = new Error(code) as Error & { erreur: unknown };
  e.erreur = { code, message: "message de test", action: "action de test" };
  return e;
}

describe("table des codes de sortie (07 §12, D-T13-9)", () => {
  it.each(CODES_ERREUR)("code domaine « %s »", (code) => {
    const attendu = CODE_3.has(code) ? 3 : CODES_2.has(code) ? 2 : 1;
    expect(codeSortiePourErreur(erreurDomaine(code))).toBe(attendu);
  });

  it("une ErreurUsageCli (commande/option inconnue) donne le code 2", () => {
    const erreur = new ErreurUsageCli("Commande inconnue.");
    expect(codeSortiePourErreur(erreur)).toBe(2);
    expect(ligneErreurCli(erreur)).toBe("INVALID_ARGUMENT : Commande inconnue.");
  });

  it("une exception inattendue (jamais une des 19 erreurs du domaine) donne le code 1 sans exposer son message brut", () => {
    const erreur = new Error("détail interne sensible");
    expect(codeSortiePourErreur(erreur)).toBe(1);
    const ligne = ligneErreurCli(erreur);
    expect(ligne).toBe("UPSTREAM_UNAVAILABLE : erreur inattendue.");
    expect(ligne).not.toContain("détail interne sensible");
  });

  it("une valeur jetée qui n'est pas une Error (jamais une trace de pile) donne aussi le code 1", () => {
    expect(codeSortiePourErreur("chaîne quelconque")).toBe(1);
    expect(ligneErreurCli({ pas: "une erreur" })).toBe("UPSTREAM_UNAVAILABLE : erreur inattendue.");
  });
});
