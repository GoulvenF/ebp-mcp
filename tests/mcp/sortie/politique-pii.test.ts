import { describe, expect, it } from "vitest";
import { appliquerPolitiqueSortie } from "../../../dist/index.js";

const REDACT = { redactPii: true };
const NORMAL = { redactPii: false };

describe("appliquerPolitiqueSortie — D-T12-8", () => {
  it("email, telephone et compte_bancaire passent à null à toute profondeur, avec un avertissement unique aux chemins généralisés", () => {
    const enveloppe = {
      dossier: "d1",
      resultats: [
        { id: "1", email: "a@exemple.fr", telephone: "0601020304" },
        { id: "2", email: "b@exemple.fr", telephone: null },
      ],
      pagination: null,
      meta: { avertissements: [] as string[] },
      bruts: [{ compte_bancaire: "FR7630006000011234567890189" }],
    };
    const masque = appliquerPolitiqueSortie(enveloppe, REDACT) as typeof enveloppe;
    expect(masque.resultats[0]?.email).toBeNull();
    expect(masque.resultats[0]?.telephone).toBeNull();
    expect(masque.resultats[1]?.telephone).toBeNull();
    expect(masque.bruts[0]?.compte_bancaire).toBeNull();
    expect(masque.meta.avertissements).toHaveLength(1);
    expect(masque.meta.avertissements[0]).toContain("resultats[].email");
    expect(masque.meta.avertissements[0]).toContain("resultats[].telephone");
    expect(masque.meta.avertissements[0]).toContain("bruts[].compte_bancaire");
  });

  it("claims.email est masqué (outils de contexte, ex. ebp_statut)", () => {
    const objet = { claims: { email: "qui@exemple.fr", sub: "123" }, autre: "valeur" };
    const masque = appliquerPolitiqueSortie(objet, REDACT) as typeof objet;
    expect(masque.claims.email).toBeNull();
    expect(masque.claims.sub).toBe("123");
  });

  it("un IBAN, un email et un téléphone sont masqués dans le message, les details et un avertissement", () => {
    const erreur = {
      code: "INVALID_ARGUMENT",
      message: "Compte FR7630006000011234567890189 invalide pour contact@exemple.fr au 0601020304.",
      action: "Corriger la valeur FR7630006000011234567890189.",
      details: { valeur: "FR7630006000011234567890189" },
    };
    const masque = appliquerPolitiqueSortie(erreur, REDACT);
    expect(masque.message).not.toContain("FR7630006000011234567890189");
    expect(masque.message).not.toContain("contact@exemple.fr");
    expect(masque.message).not.toContain("0601020304");
    expect(masque.message).toContain("[masqué]");
    expect(masque.action).toContain("[masqué]");
    expect(masque.details.valeur).toBe("[masqué]");
  });

  it("hors mode PII, rien n'est masqué", () => {
    const enveloppe = { resultats: [{ email: "a@exemple.fr" }], meta: { avertissements: [] as string[] } };
    const inchange = appliquerPolitiqueSortie(enveloppe, NORMAL);
    expect(inchange).toEqual(enveloppe);
  });

  it("réponse servie par le cache : masquée aussi (pas d'état particulier côté politique)", () => {
    const depuisCache = { resultats: [{ email: "cache@exemple.fr" }], meta: { avertissements: [] as string[] } };
    const masque = appliquerPolitiqueSortie(depuisCache, REDACT) as typeof depuisCache;
    expect(masque.resultats[0]?.email).toBeNull();
  });
});
