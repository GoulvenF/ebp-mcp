import { describe, expect, it } from "vitest";
import { estCompte, estIdentifiantChaine, estUuid, interpreterEnum } from "../dist/domain/index.js";

describe("estCompte (A26 : conservé tel quel, aucune normalisation)", () => {
  it("conserve les zéros de tête et accepte un compte court", () => {
    expect(estCompte("0004100")).toBe(true);
    expect(estCompte("411")).toBe(true);
  });

  it("refuse une chaîne vide ou un espace de bord", () => {
    expect(estCompte("")).toBe(false);
    expect(estCompte(" 411")).toBe(false);
    expect(estCompte("411 ")).toBe(false);
  });
});

describe("estUuid / estIdentifiantChaine", () => {
  it("accepte un UUID RFC 4122 quelle que soit la casse", () => {
    expect(estUuid("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(estUuid("550E8400-E29B-41D4-A716-446655440000")).toBe(true);
    expect(estUuid("pas-un-uuid")).toBe(false);
  });

  it("préserve zéros de tête et suffixes d'un identifiant chaîne", () => {
    expect(estIdentifiantChaine("0004100")).toBe(true);
    expect(estIdentifiantChaine("")).toBe(false);
  });
});

describe("interpreterEnum (A26 : valeur inconnue ⇒ \"inconnu\" + avertissement)", () => {
  it("valeur connue : telle quelle, sans avertissement", () => {
    const resultat = interpreterEnum("valide", ["provisoire", "valide", "facture"] as const);
    expect(resultat).toEqual({ valeur: "valide", valeur_origine: null, avertissement: null });
  });

  it("valeur inconnue : \"inconnu\" avec un avertissement citant la valeur d'origine", () => {
    const resultat = interpreterEnum("Brouillon", ["provisoire", "valide", "facture"] as const);
    expect(resultat.valeur).toBe("inconnu");
    expect(resultat.valeur_origine).toBe("Brouillon");
    expect(resultat.avertissement).toContain("Brouillon");
  });
});
