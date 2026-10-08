import { describe, expect, it } from "vitest";
import { capturerContexteDossier, creerSession, resoudreConfig } from "../../dist/config/index.js";
import { entreesBase, fichierBase } from "./fixtures.js";

function configAvecDeuxDossiersProd() {
  const fichier = fichierBase() as any;
  fichier.profiles.default.dossiers.prod.push({
    alias: "second-prod",
    famille: "hubbix-gescom",
    nom: null,
    domainId: "55555555-5555-4555-8555-555555555555",
  });
  return resoudreConfig(entreesBase({ fichier, cli: { env: "prod" } }));
}

describe("session.ts", () => {
  it("choisir() ne modifie pas un contexte déjà capturé, qui reste gelé", () => {
    const config = configAvecDeuxDossiersProd();
    const session = creerSession(config);
    const contexte = capturerContexteDossier(config, session, {});
    expect(contexte.dossier.alias).toBe("dossier-prod");
    expect(Object.isFrozen(contexte)).toBe(true);

    session.choisir("second-prod");

    expect(contexte.dossier.alias).toBe("dossier-prod");
    expect(contexte.environnement).toBe("prod");
    expect(() => {
      (contexte as any).dossier = null;
    }).toThrow();
  });

  it("choisir() ne touche jamais la config ni un lecteur (aucun effet observable hors session)", () => {
    const config = configAvecDeuxDossiersProd();
    const session = creerSession(config);
    const dossiersAvant = config.dossiers;
    session.choisir("second-prod");
    expect(config.dossiers).toBe(dossiersAvant);
  });

  it("choisir() d'un alias inconnu ⇒ DOSSIER_UNKNOWN, la session garde son dossier précédent", () => {
    const config = configAvecDeuxDossiersProd();
    const session = creerSession(config);
    session.choisir("second-prod");
    expect(() => session.choisir("alias-inexistant")).toThrowError(
      expect.objectContaining({ erreur: expect.objectContaining({ code: "DOSSIER_UNKNOWN" }) }),
    );
    expect(session.alias()).toBe("second-prod");
  });

  it("reinitialiser() retombe sur le défaut de l'environnement", () => {
    const config = configAvecDeuxDossiersProd();
    const session = creerSession(config);
    session.choisir("second-prod");
    expect(session.alias()).toBe("second-prod");
    session.reinitialiser();
    expect(session.alias()).toBeNull();
    const contexte = capturerContexteDossier(config, session, {});
    expect(contexte.dossier.alias).toBe("dossier-prod");
  });
});
