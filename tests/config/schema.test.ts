import { describe, expect, it } from "vitest";
import { schemaFichierConfig } from "../../dist/config/index.js";
import { DOMAIN_ID_DEMO, fichierBase, TENANT_ID_DEMO } from "./fixtures.js";

function valide(fichier: unknown): boolean {
  return schemaFichierConfig.safeParse(fichier).success;
}

describe("schema.ts : schemaVersion", () => {
  it("absent refusé", () => {
    const f = fichierBase() as any;
    delete f.schemaVersion;
    expect(valide(f)).toBe(false);
  });
  it("0 refusé", () => {
    const f = fichierBase() as any;
    f.schemaVersion = 0;
    expect(valide(f)).toBe(false);
  });
  it("2 refusé", () => {
    const f = fichierBase() as any;
    f.schemaVersion = 2;
    expect(valide(f)).toBe(false);
  });
});

describe("schema.ts : champs stricts", () => {
  it("champ inconnu à la racine refusé", () => {
    const f = fichierBase() as any;
    f.champInconnu = true;
    expect(valide(f)).toBe(false);
  });
  it("champ inconnu dans un profil refusé", () => {
    const f = fichierBase() as any;
    f.profiles.default.champInconnu = true;
    expect(valide(f)).toBe(false);
  });
});

describe("schema.ts : alias", () => {
  const ALIAS_INVALIDES = ["Acme", "-acme", "..", "a/b", "a\\b", "a".repeat(65), ""];
  it.each(ALIAS_INVALIDES)("alias invalide refusé : %j", (alias) => {
    const f = fichierBase() as any;
    f.profiles.default.dossiers.prod[0].alias = alias;
    expect(valide(f)).toBe(false);
  });
});

describe("schema.ts : GUID", () => {
  it("tenantId non conforme refusé", () => {
    const f = fichierBase() as any;
    f.profiles.default.dossiers.prod[0].tenantId = "pas-un-guid";
    expect(valide(f)).toBe(false);
  });
  it("tenantId sur hubbix-gescom refusé", () => {
    const f = fichierBase() as any;
    f.profiles.default.dossiers.preprod[0].tenantId = TENANT_ID_DEMO;
    expect(valide(f)).toBe(false);
  });
  it("domainId sur hubbix-compta refusé", () => {
    const f = fichierBase() as any;
    f.profiles.default.dossiers.prod[0].domainId = DOMAIN_ID_DEMO;
    expect(valide(f)).toBe(false);
  });
});

describe("schema.ts : intégrité croisée", () => {
  it("groupe de quota référencé non déclaré refusé", () => {
    const f = fichierBase() as any;
    f.profiles.default.quotaGroup = "inexistant";
    expect(valide(f)).toBe(false);
  });

  it("groupe de quota nommé comme un membre de Object.prototype refusé", () => {
    // `constructor` satisfait RE_IDENTIFIANT : le contrôle d'intégrité doit porter sur
    // les propriétés propres de quotaGroups, pas sur la chaîne de prototypes.
    const f = fichierBase() as any;
    f.profiles.default.quotaGroup = "constructor";
    expect(valide(f)).toBe(false);
  });

  it("groupe de quota d'une famille nommé comme un membre de Object.prototype refusé", () => {
    const f = fichierBase() as any;
    f.profiles.default.subscriptionByFamily = {
      "hubbix-compta": { key: "k", quotaGroup: "constructor" },
    };
    expect(valide(f)).toBe(false);
  });

  it("defaultDossier.prod pointant un alias absent refusé", () => {
    const f = fichierBase() as any;
    f.profiles.default.defaultDossier.prod = "alias-absent";
    expect(valide(f)).toBe(false);
  });

  it("subscriptionByFamily sur une famille non activée refusé", () => {
    const f = fichierBase() as any;
    f.profiles.default.enabledFamilies = ["hubbix-compta"];
    f.profiles.default.subscriptionByFamily = { "hubbix-gescom": { key: "k", quotaGroup: "grp" } };
    expect(valide(f)).toBe(false);
  });

  it("reserve >= maxPerDay refusé", () => {
    const f = fichierBase() as any;
    f.quotaGroups.grp.reserve = 10000;
    f.quotaGroups.grp.maxPerDay = 10000;
    expect(valide(f)).toBe(false);
  });

  it("resetTimezone invalide refusé", () => {
    const f = fichierBase() as any;
    f.quotaGroups.grp.resetTimezone = "Pas/UnFuseau";
    expect(valide(f)).toBe(false);
  });
});

describe("schema.ts : redirectUri", () => {
  const INVALIDES = [
    "http://localhost:8080/callback",
    "https://127.0.0.1:8080/callback",
    "http://127.0.0.1:8080/callback?x=1",
    "http://example.com/callback",
    "ftp://127.0.0.1/callback",
  ];
  it.each(INVALIDES)("redirectUri refusé : %s", (redirectUri) => {
    const f = fichierBase() as any;
    f.profiles.default.redirectUri = redirectUri;
    expect(valide(f)).toBe(false);
  });

  it("redirectUri loopback IPv6 accepté", () => {
    const f = fichierBase() as any;
    f.profiles.default.redirectUri = "http://[::1]:8080/callback";
    expect(valide(f)).toBe(true);
  });
});

describe("schema.ts : fichier de base valide", () => {
  it("accepte le fichier de référence", () => {
    expect(valide(fichierBase())).toBe(true);
  });
});
