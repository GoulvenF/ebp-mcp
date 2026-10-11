import { describe, expect, it } from "vitest";
import { versErreurMetier } from "../../../dist/index.js";

const SANS_PII = { redactPii: false };

class ErreurFactice extends Error {
  readonly erreur: { code: string; message: string; action: string; details?: Record<string, unknown> };
  constructor(erreur: { code: string; message: string; action: string; details?: Record<string, unknown> }) {
    super(erreur.message);
    this.erreur = erreur;
  }
}

describe("versErreurMetier — D-T12-5", () => {
  it("une exception inconnue donne le message générique UPSTREAM_UNAVAILABLE, sans stack ni message d'origine", () => {
    const resultat = versErreurMetier(new Error("secret interne, jamais exposé"), SANS_PII);
    expect(resultat).toEqual({
      code: "UPSTREAM_UNAVAILABLE",
      message: "Erreur inattendue du serveur MCP",
      action: "Réessayer ; consulter les journaux stderr si l'erreur persiste",
    });
  });

  it("une valeur non-Error (rejet exotique) donne aussi le message générique", () => {
    const resultat = versErreurMetier("chaîne rejetée", SANS_PII);
    expect(resultat.code).toBe("UPSTREAM_UNAVAILABLE");
  });

  it("une erreur du domaine conserve code/message/action et filtre `details` par liste blanche", () => {
    const e = new ErreurFactice({
      code: "UNSUPPORTED_CAPABILITY",
      message: "Capacité refusée.",
      action: "Retirer l'option.",
      details: { outil: "fiche_article", option: "reference.type", motif: "non prouvé", valeur: "secret-interne" },
    });
    const resultat = versErreurMetier(e, SANS_PII);
    expect(resultat.code).toBe("UNSUPPORTED_CAPABILITY");
    expect(resultat.message).toBe("Capacité refusée.");
    expect(resultat.details).toEqual({ outil: "fiche_article", option: "reference.type" });
    expect(resultat.details).not.toHaveProperty("motif");
    expect(resultat.details).not.toHaveProperty("valeur");
  });

  it("`details.problemes[]` ne conserve que `chemin`/`message`, aucune autre clé", () => {
    const e = new ErreurFactice({
      code: "INVALID_ARGUMENT",
      message: "Entrée invalide.",
      action: "Corriger.",
      details: { outil: "exercices", problemes: [{ chemin: "limite", message: "trop grand", secretInterne: true }] },
    });
    const resultat = versErreurMetier(e, SANS_PII);
    expect(resultat.details).toEqual({ outil: "exercices", problemes: [{ chemin: "limite", message: "trop grand" }] });
  });

  it("une erreur du domaine sans détail de la liste blanche omet `details`", () => {
    const e = new ErreurFactice({
      code: "DOSSIER_REQUIRED",
      message: "Aucun dossier résolu.",
      action: "Préciser dossier.",
    });
    const resultat = versErreurMetier(e, SANS_PII);
    expect(resultat).not.toHaveProperty("details");
  });

  it("en mode PII, le message et les details d'une erreur domaine sont masqués", () => {
    const e = new ErreurFactice({
      code: "INVALID_ARGUMENT",
      message: "Valeur contact@exemple.fr refusée pour `compte`.",
      action: "Corriger `compte`.",
      details: { champ: "compte" },
    });
    const resultat = versErreurMetier(e, { redactPii: true });
    expect(resultat.message).not.toContain("contact@exemple.fr");
    expect(resultat.message).toContain("[masqué]");
  });
});
