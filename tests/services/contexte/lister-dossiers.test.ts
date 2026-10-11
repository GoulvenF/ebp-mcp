import { describe, expect, it } from "vitest";
import { listerDossiersContexte, manifesteCapacites } from "../../../dist/index.js";
import { aliasDe, configDe, DOMAIN_ID_GC, TENANT_ID_CPT, TENANT_ID_CPT_2 } from "./fixtures.js";

describe("listerDossiersContexte (D-T12-11)", () => {
  it("seuls les dossiers de l'environnement actif (prod) sont listés", () => {
    const config = configDe();
    const resultat = listerDossiersContexte(config, null);
    expect(resultat.environnement).toBe("prod");
    expect(resultat.dossiers.map((d) => d.alias)).toEqual(["dossier-cpt", "dossier-gc"]);
  });

  it("dossier d'une famille active ⇒ capacités = manifesteCapacites(famille), famille_active: true", () => {
    const config = configDe();
    const resultat = listerDossiersContexte(config, null);
    const dossierCpt = resultat.dossiers.find((d) => d.alias === "dossier-cpt");
    expect(dossierCpt?.famille_active).toBe(true);
    expect(dossierCpt?.capacites).toEqual(manifesteCapacites("hubbix-compta"));
    expect(dossierCpt?.validation_live).toBe("non_prouvee");
  });

  it("famille non active ⇒ tous les outils non_supportee, motif « famille non activée dans le profil »", () => {
    const config = configDe({ enabledFamilies: ["hubbix-compta"] });
    const resultat = listerDossiersContexte(config, null);
    const dossierGc = resultat.dossiers.find((d) => d.alias === "dossier-gc");
    expect(dossierGc?.famille_active).toBe(false);
    expect(dossierGc?.capacites.length).toBeGreaterThan(0);
    for (const capacite of dossierGc?.capacites ?? []) {
      expect(capacite.statut).toBe("non_supportee");
      expect(capacite.motif).toBe("famille non activée dans le profil");
      expect(capacite.optionsNonSupportees).toEqual([]);
    }
  });

  it("dossier actif = alias de session s'il est fourni, sinon le défaut ; dossier_defaut toujours celui de la config", () => {
    const config = configDe({
      dossiersProd: [
        { alias: "dossier-cpt", famille: "hubbix-compta", nom: "Dossier CPT", tenantId: TENANT_ID_CPT },
        { alias: "dossier-cpt-2", famille: "hubbix-compta", nom: "Dossier CPT 2", tenantId: TENANT_ID_CPT_2 },
        { alias: "dossier-gc", famille: "hubbix-gescom", nom: null, domainId: DOMAIN_ID_GC },
      ],
      defaultDossierProd: "dossier-cpt",
    });

    const avecSession = listerDossiersContexte(config, aliasDe("dossier-cpt-2"));
    expect(avecSession.dossier_actif).toBe("dossier-cpt-2");
    expect(avecSession.dossier_defaut).toBe("dossier-cpt");

    const sansSession = listerDossiersContexte(config, null);
    expect(sansSession.dossier_actif).toBe("dossier-cpt");
    expect(sansSession.dossier_defaut).toBe("dossier-cpt");
  });
});
