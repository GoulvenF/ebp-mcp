import { describe, expect, it } from "vitest";
import { choisirDossierContexte, creerSession } from "../../../dist/index.js";
import { configDe } from "./fixtures.js";

describe("choisirDossierContexte (D-T12-11)", () => {
  it("alias inconnu ⇒ DOSSIER_UNKNOWN, session inchangée", () => {
    const config = configDe();
    const session = creerSession({ dossiers: config.dossiers, environnement: config.environnement });
    session.choisir("dossier-cpt");

    expect(() => choisirDossierContexte(config, session, { dossier: "alias-absent" })).toThrowError(
      expect.objectContaining({ erreur: expect.objectContaining({ code: "DOSSIER_UNKNOWN" }) }),
    );
    expect(session.alias()).toBe("dossier-cpt");
  });

  it("entrée avec clé inconnue ⇒ INVALID_ARGUMENT, session inchangée", () => {
    const config = configDe();
    const session = creerSession({ dossiers: config.dossiers, environnement: config.environnement });

    expect(() => choisirDossierContexte(config, session, { dossier: "dossier-cpt", autre: "x" })).toThrowError(
      expect.objectContaining({ erreur: expect.objectContaining({ code: "INVALID_ARGUMENT" }) }),
    );
    expect(session.alias()).toBeNull();
  });

  it("alias connu ⇒ nouveau contexte de session, config persistée non modifiée", () => {
    const config = configDe();
    const dossiersAvant = config.dossiers;
    const session = creerSession({ dossiers: config.dossiers, environnement: config.environnement });

    const resultat = choisirDossierContexte(config, session, { dossier: "dossier-gc" });

    expect(resultat).toEqual({ dossier_actif: "dossier-gc", famille: "hubbix-gescom", nom: null });
    expect(session.alias()).toBe("dossier-gc");
    expect(config.dossiers).toBe(dossiersAvant);
  });
});
