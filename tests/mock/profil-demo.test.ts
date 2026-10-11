// Critère d'acceptation #1 (GOU-371, T13-1) : `PROFIL_DEMO` doit passer `schemaFichierConfig` puis
// `resoudreConfig`, exactement comme un vrai `config.json` d'utilisateur.
import { describe, expect, it } from "vitest";
import {
  CLIENT_ID_DEMO,
  DOMAIN_ID_DEMO_GC,
  PROFIL_DEMO,
  TENANT_ID_DEMO_CPT,
  resoudreConfig,
  schemaFichierConfig,
} from "../../dist/index.js";
import { journalEspion } from "../config/fixtures.js";

describe("PROFIL_DEMO (D-T13-5, critère #1)", () => {
  it("passe schemaFichierConfig sans erreur", () => {
    const resultat = schemaFichierConfig.safeParse(PROFIL_DEMO);
    expect(resultat.success).toBe(true);
  });

  it("se résout par resoudreConfig sur le profil `demo`, sans avertissement", () => {
    const journal = journalEspion();
    const config = resoudreConfig({
      contenuFichier: JSON.stringify(PROFIL_DEMO),
      variablesEnv: {},
      cli: { profile: "demo" },
      racine: "/config-racine-demo",
      journal,
    });
    expect(journal.messages).toEqual([]);
    expect(config.profil).toBe("demo");
    expect(config.environnement).toBe("prod");
    expect(config.clientId).toBe(CLIENT_ID_DEMO);
    expect(config.pkce).toBe("required");
    expect(config.redirectUri).toBe("http://127.0.0.1:8732/callback");
  });

  it("expose exactement les deux dossiers synthétiques demo-cpt/demo-gc avec les GUID attendus", () => {
    const config = resoudreConfig({
      contenuFichier: JSON.stringify(PROFIL_DEMO),
      variablesEnv: {},
      cli: { profile: "demo" },
      racine: "/config-racine-demo",
      journal: journalEspion(),
    });
    expect(config.dossiers.prod.map((d) => ({ alias: d.alias, famille: d.famille, id: d.id }))).toEqual([
      { alias: "demo-cpt", famille: "hubbix-compta", id: TENANT_ID_DEMO_CPT },
      { alias: "demo-gc", famille: "hubbix-gescom", id: DOMAIN_ID_DEMO_GC },
    ]);
    expect(config.aliasDefaut).toBe("demo-cpt");
    expect(config.dossiers.preprod).toEqual([]);
  });

  it("déclare le groupe de quota `demo` avec minIntervalMs: 0 (D-T13-5)", () => {
    const config = resoudreConfig({
      contenuFichier: JSON.stringify(PROFIL_DEMO),
      variablesEnv: {},
      cli: { profile: "demo" },
      racine: "/config-racine-demo",
      journal: journalEspion(),
    });
    expect(config.groupesQuota.get("demo" as never)).toMatchObject({ minIntervalMs: 0 });
  });
});
