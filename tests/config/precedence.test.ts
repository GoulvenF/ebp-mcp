import { describe, expect, it } from "vitest";
import { resoudreConfig } from "../../dist/config/index.js";
import type { Identifiant } from "../../dist/config/index.js";
import { entreesBase, fichierBase } from "./fixtures.js";

/**
 * Table de précédence (07 §2, critère d'acceptation explicite de T02). Chaque bloc couvre une
 * ligne du tableau de resolution.ts : CLI seul, env seul, profil seul, CLI+env, env+profil, rien.
 */

function fichierAvecProfilAutre(): Record<string, unknown> {
  const fichier = fichierBase() as any;
  fichier.profiles.autre = {
    env: "preprod",
    clientId: "client-autre",
    redirectUri: "http://127.0.0.1:9001/callback",
    enabledFamilies: ["hubbix-compta"],
    quotaGroup: "grp",
    dossiers: { prod: [], preprod: [] },
  };
  return fichier;
}

describe("précédence : sélection du profil", () => {
  it("CLI seul l'emporte sur EBP_PROFILE et sur le défaut", () => {
    const config = resoudreConfig(
      entreesBase({
        fichier: fichierAvecProfilAutre(),
        cli: { profile: "autre" },
        variablesEnv: { profile: "default" },
      }),
    );
    expect(config.profil).toBe("autre");
  });

  it("EBP_PROFILE seul l'emporte sur le défaut", () => {
    const config = resoudreConfig(
      entreesBase({ fichier: fichierAvecProfilAutre(), variablesEnv: { profile: "autre" } }),
    );
    expect(config.profil).toBe("autre");
  });

  it("rien ⇒ profil par défaut \"default\"", () => {
    const config = resoudreConfig(entreesBase({ fichier: fichierAvecProfilAutre() }));
    expect(config.profil).toBe("default");
  });

  it("profil absent du fichier ⇒ CONFIG_INVALID", () => {
    expect(() => resoudreConfig(entreesBase({ cli: { profile: "inexistant" } }))).toThrowError(
      expect.objectContaining({ erreur: expect.objectContaining({ code: "CONFIG_INVALID" }) }),
    );
  });
});

describe("précédence : environnement", () => {
  it("CLI seul", () => {
    const config = resoudreConfig(entreesBase({ cli: { env: "preprod" } }));
    expect(config.environnement).toBe("preprod");
  });
  it("env seul", () => {
    const config = resoudreConfig(entreesBase({ variablesEnv: { env: "preprod" } }));
    expect(config.environnement).toBe("preprod");
  });
  it("profil seul", () => {
    const config = resoudreConfig(entreesBase());
    expect(config.environnement).toBe("prod");
  });
  it("CLI + env ⇒ CLI gagne", () => {
    const config = resoudreConfig(entreesBase({ cli: { env: "preprod" }, variablesEnv: { env: "prod" } }));
    expect(config.environnement).toBe("preprod");
  });
  it("env + profil ⇒ env gagne", () => {
    const config = resoudreConfig(entreesBase({ variablesEnv: { env: "preprod" } }));
    expect(config.environnement).toBe("preprod");
  });
});

describe("précédence : clientId", () => {
  it("CLI seul", () => {
    const config = resoudreConfig(entreesBase({ cli: { clientId: "cli-id" } }));
    expect(config.clientId).toBe("cli-id");
  });
  it("env seul", () => {
    const config = resoudreConfig(entreesBase({ variablesEnv: { clientId: "env-id" } }));
    expect(config.clientId).toBe("env-id");
  });
  it("profil seul", () => {
    const config = resoudreConfig(entreesBase());
    expect(config.clientId).toBe("client-defaut");
  });
  it("CLI + env ⇒ CLI gagne", () => {
    const config = resoudreConfig(entreesBase({ cli: { clientId: "cli-id" }, variablesEnv: { clientId: "env-id" } }));
    expect(config.clientId).toBe("cli-id");
  });
  it("env + profil ⇒ env gagne", () => {
    const config = resoudreConfig(entreesBase({ variablesEnv: { clientId: "env-id" } }));
    expect(config.clientId).toBe("env-id");
  });
});

describe("précédence : clientSecret (pas de CLI possible, décision 8)", () => {
  it("env seul", () => {
    const config = resoudreConfig(entreesBase({ variablesEnv: { clientSecret: "s3cr3t-env" } }));
    expect(config.clientSecret?.reveler()).toBe("s3cr3t-env");
  });
  it("profil seul", () => {
    const fichier = fichierBase() as any;
    fichier.profiles.default.clientSecret = "s3cr3t-profil";
    const config = resoudreConfig(entreesBase({ fichier }));
    expect(config.clientSecret?.reveler()).toBe("s3cr3t-profil");
  });
  it("env + profil ⇒ env gagne", () => {
    const fichier = fichierBase() as any;
    fichier.profiles.default.clientSecret = "s3cr3t-profil";
    const config = resoudreConfig(entreesBase({ fichier, variablesEnv: { clientSecret: "s3cr3t-env" } }));
    expect(config.clientSecret?.reveler()).toBe("s3cr3t-env");
  });
  it("rien ⇒ null", () => {
    const config = resoudreConfig(entreesBase());
    expect(config.clientSecret).toBeNull();
  });
});

describe("précédence : clé d'abonnement par défaut vs clé de famille", () => {
  it("EBP_SUBSCRIPTION_KEY écrase la clé par défaut du profil", () => {
    const fichier = fichierBase() as any;
    fichier.profiles.default.subscriptionKey = "cle-profil-defaut";
    const config = resoudreConfig(
      entreesBase({ fichier, variablesEnv: { subscriptionKey: "cle-env" } }),
    );
    expect(config.abonnementPourFamille("hubbix-gescom").cle?.reveler()).toBe("cle-env");
  });

  it("EBP_SUBSCRIPTION_KEY NE remplace JAMAIS une clé spécifique de famille", () => {
    const fichier = fichierBase() as any;
    fichier.profiles.default.subscriptionByFamily = {
      "hubbix-compta": { key: "cle-famille-compta", quotaGroup: "grp" },
    };
    const config = resoudreConfig(
      entreesBase({ fichier, variablesEnv: { subscriptionKey: "cle-env-defaut" } }),
    );
    expect(config.abonnementPourFamille("hubbix-compta").cle?.reveler()).toBe("cle-famille-compta");
    expect(config.abonnementPourFamille("hubbix-gescom").cle?.reveler()).toBe("cle-env-defaut");
  });
});

describe("précédence : redirectUri", () => {
  it("CLI seul", () => {
    const config = resoudreConfig(entreesBase({ cli: { redirectUri: "http://127.0.0.1:9999/cli" } }));
    expect(config.redirectUri).toBe("http://127.0.0.1:9999/cli");
  });
  it("env seul", () => {
    const config = resoudreConfig(entreesBase({ variablesEnv: { redirectUri: "http://127.0.0.1:9998/env" } }));
    expect(config.redirectUri).toBe("http://127.0.0.1:9998/env");
  });
  it("profil seul", () => {
    const config = resoudreConfig(entreesBase());
    expect(config.redirectUri).toBe("http://127.0.0.1:9000/callback");
  });
  it("CLI + env ⇒ CLI gagne", () => {
    const config = resoudreConfig(
      entreesBase({ cli: { redirectUri: "http://127.0.0.1:9999/cli" }, variablesEnv: { redirectUri: "http://127.0.0.1:9998/env" } }),
    );
    expect(config.redirectUri).toBe("http://127.0.0.1:9999/cli");
  });
  it("env + profil ⇒ env gagne", () => {
    const config = resoudreConfig(entreesBase({ variablesEnv: { redirectUri: "http://127.0.0.1:9998/env" } }));
    expect(config.redirectUri).toBe("http://127.0.0.1:9998/env");
  });
});

describe("précédence : reserve du groupe de quota", () => {
  it("EBP_QUOTA_RESERVE s'applique à TOUS les groupes utilisés par le processus", () => {
    const fichier = fichierBase() as any;
    fichier.profiles.default.subscriptionByFamily = {
      "hubbix-gescom": { key: "cle-gc", quotaGroup: "grp-secondaire" },
    };
    fichier.quotaGroups["grp-secondaire"] = {
      maxPerDay: 5000,
      reserve: 200,
      minIntervalMs: 1000,
      resetTimezone: "Europe/Paris",
    };
    const config = resoudreConfig(entreesBase({ fichier, variablesEnv: { quotaReserve: 42 } }));
    expect(config.groupesQuota.get("grp" as Identifiant)?.reserve).toBe(42);
    expect(config.groupesQuota.get("grp-secondaire" as Identifiant)?.reserve).toBe(42);
  });

  it("valeur du groupe sans override env", () => {
    const config = resoudreConfig(entreesBase());
    expect(config.groupesQuota.get("grp" as Identifiant)?.reserve).toBe(500);
  });

  it("rien ⇒ défaut documenté 500", () => {
    const fichier = fichierBase() as any;
    delete fichier.quotaGroups.grp.reserve;
    const config = resoudreConfig(entreesBase({ fichier }));
    expect(config.groupesQuota.get("grp" as Identifiant)?.reserve).toBe(500);
  });
});

describe("précédence : maxPerDay/minIntervalMs/resetTimezone — valeur du groupe > défauts", () => {
  it("valeur du groupe conservée", () => {
    const fichier = fichierBase() as any;
    fichier.quotaGroups.grp.maxPerDay = 777;
    fichier.quotaGroups.grp.minIntervalMs = 2000;
    fichier.quotaGroups.grp.resetTimezone = "Europe/London";
    const config = resoudreConfig(entreesBase({ fichier }));
    const groupe = config.groupesQuota.get("grp" as Identifiant);
    expect(groupe?.maxPerDay).toBe(777);
    expect(groupe?.minIntervalMs).toBe(2000);
    expect(groupe?.resetTimezone).toBe("Europe/London");
  });

  it("rien ⇒ défauts documentés 10000 / 1000 / Europe/Paris", () => {
    const fichier = fichierBase() as any;
    delete fichier.quotaGroups.grp.maxPerDay;
    delete fichier.quotaGroups.grp.minIntervalMs;
    delete fichier.quotaGroups.grp.resetTimezone;
    const config = resoudreConfig(entreesBase({ fichier }));
    const groupe = config.groupesQuota.get("grp" as Identifiant);
    expect(groupe?.maxPerDay).toBe(10000);
    expect(groupe?.minIntervalMs).toBe(1000);
    expect(groupe?.resetTimezone).toBe("Europe/Paris");
  });
});

describe("précédence : pkce — profil > required, aucun override env/CLI", () => {
  it("profil seul", () => {
    const fichier = fichierBase() as any;
    fichier.profiles.default.pkce = "disabled";
    const config = resoudreConfig(entreesBase({ fichier }));
    expect(config.pkce).toBe("disabled");
  });
  it("rien ⇒ défaut documenté required", () => {
    const config = resoudreConfig(entreesBase());
    expect(config.pkce).toBe("required");
  });
});

describe("précédence : redactPii", () => {
  it("env seul", () => {
    const config = resoudreConfig(entreesBase({ variablesEnv: { redactPii: true } }));
    expect(config.redactPii).toBe(true);
  });
  it("rien ⇒ défaut documenté false", () => {
    const config = resoudreConfig(entreesBase());
    expect(config.redactPii).toBe(false);
  });
});
