import { describe, expect, it } from "vitest";
import {
  exigerFamilleActive,
  resoudreConfig,
  resoudreDossier,
  validerIdDistant,
  versSegmentChemin,
} from "../../dist/config/index.js";
import type { Identifiant } from "../../dist/config/index.js";
import { entreesBase, fichierBase } from "./fixtures.js";

function attendCode(fn: () => unknown, code: string): void {
  expect(fn).toThrowError(expect.objectContaining({ erreur: expect.objectContaining({ code }) }));
}

describe("dossiers.ts : resoudreDossier", () => {
  it("alias inconnu ⇒ DOSSIER_UNKNOWN", () => {
    const config = resoudreConfig(entreesBase());
    attendCode(() => resoudreDossier(config, { dossier: "nexiste-pas" }, null), "DOSSIER_UNKNOWN");
  });

  it("alias déclaré seulement en prod est inconnu en preprod", () => {
    const config = resoudreConfig(entreesBase({ cli: { env: "preprod" } }));
    attendCode(() => resoudreDossier(config, { dossier: "dossier-prod" }, null), "DOSSIER_UNKNOWN");
  });

  it("alias déclaré seulement en preprod est inconnu en prod", () => {
    const config = resoudreConfig(entreesBase({ cli: { env: "prod" } }));
    attendCode(() => resoudreDossier(config, { dossier: "dossier-preprod" }, null), "DOSSIER_UNKNOWN");
  });

  it("ni argument, ni session, ni défaut ⇒ DOSSIER_REQUIRED même avec un seul dossier déclaré", () => {
    const fichier = fichierBase() as any;
    delete fichier.profiles.default.defaultDossier;
    fichier.profiles.default.dossiers.preprod = [];
    const config = resoudreConfig(entreesBase({ fichier, cli: { env: "prod" } }));
    expect(config.dossiers.prod.length).toBe(1);
    attendCode(() => resoudreDossier(config, {}, null), "DOSSIER_REQUIRED");
  });

  it("argument > session > défaut", () => {
    const fichier = fichierBase() as any;
    fichier.profiles.default.dossiers.prod.push({
      alias: "autre-prod",
      famille: "hubbix-gescom",
      nom: null,
      domainId: "44444444-4444-4444-8444-444444444444",
    });
    const config = resoudreConfig(entreesBase({ fichier, cli: { env: "prod" } }));
    const parArgument = resoudreDossier(config, { dossier: "autre-prod" }, "dossier-prod" as Identifiant);
    expect(parArgument.alias).toBe("autre-prod");
    const parSession = resoudreDossier(config, {}, "autre-prod" as Identifiant);
    expect(parSession.alias).toBe("autre-prod");
    const parDefaut = resoudreDossier(config, {}, null);
    expect(parDefaut.alias).toBe("dossier-prod");
  });

  it("dossier d'une famille absente de enabledFamilies ⇒ UNSUPPORTED_CAPABILITY", () => {
    const fichier = fichierBase() as any;
    fichier.profiles.default.enabledFamilies = ["hubbix-compta"];
    fichier.profiles.default.subscriptionByFamily = undefined;
    const config = resoudreConfig(entreesBase({ fichier, cli: { env: "preprod" } }));
    attendCode(() => resoudreDossier(config, { dossier: "dossier-preprod" }, null), "UNSUPPORTED_CAPABILITY");
    attendCode(() => exigerFamilleActive(config, "hubbix-gescom"), "UNSUPPORTED_CAPABILITY");
  });

  it("normalisation tenantId/domainId ⇒ id", () => {
    const config = resoudreConfig(entreesBase());
    expect(config.dossiers.prod[0]?.id).toBe("11111111-1111-4111-8111-111111111111");
    expect(config.dossiers.preprod[0]?.id).toBe("33333333-3333-4333-8333-333333333333");
  });
});

describe("identifiers.ts : validerIdDistant", () => {
  const INVALIDES = ["", ".", "..", "a/b", "a%2fb", "a\u0000b", " a"];
  it.each(INVALIDES)("refuse %j", (valeur) => {
    expect(() => validerIdDistant(valeur)).toThrow();
  });

  it("accepte un GUID", () => {
    expect(validerIdDistant("11111111-1111-4111-8111-111111111111")).toBe(
      "11111111-1111-4111-8111-111111111111",
    );
  });
});

describe("identifiers.ts : versSegmentChemin", () => {
  it("encode un identifiant valide sans jamais produire de /", () => {
    const segment = versSegmentChemin("abc def#1");
    expect(segment).toBe(encodeURIComponent("abc def#1"));
    expect(segment.includes("/")).toBe(false);
  });

  it("rejette un identifiant contenant / avant tout encodage", () => {
    expect(() => versSegmentChemin("a/b")).toThrow();
  });

  it("rejette la valeur réservée ..", () => {
    expect(() => versSegmentChemin("..")).toThrow();
  });
});
