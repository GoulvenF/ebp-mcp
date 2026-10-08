import { inspect } from "node:util";
import { describe, expect, it } from "vitest";
import { erreurConfigInvalide, resoudreConfig, secret, vuePourStatut } from "../../dist/config/index.js";
import { entreesBase, fichierBase } from "./fixtures.js";

const SECRET_CLIENT = "s3cret-client-xyz";
const SECRET_ABONNEMENT = "s3cret-abonnement-xyz";

function configAvecSecrets() {
  const fichier = fichierBase() as any;
  fichier.profiles.default.clientSecret = SECRET_CLIENT;
  fichier.profiles.default.subscriptionKey = SECRET_ABONNEMENT;
  return resoudreConfig(entreesBase({ fichier }));
}

describe("secret.ts", () => {
  it("reveler() rend la valeur d'origine", () => {
    const s = secret("valeur");
    expect(s.reveler()).toBe("valeur");
    expect(s.longueur).toBe(6);
  });

  it("JSON.stringify ne contient jamais la valeur", () => {
    const s = secret("ne-doit-pas-apparaitre");
    expect(JSON.stringify({ s })).not.toContain("ne-doit-pas-apparaitre");
    expect(JSON.stringify({ s })).toContain("[redacted]");
  });

  it("util.inspect ne contient jamais la valeur", () => {
    const s = secret("ne-doit-pas-apparaitre-2");
    expect(inspect(s, { depth: null })).not.toContain("ne-doit-pas-apparaitre-2");
  });

  it("toString() ne contient jamais la valeur", () => {
    const s = secret("ne-doit-pas-apparaitre-3");
    expect(String(s)).toBe("[redacted]");
  });
});

describe("secrets.test : ConfigResolue et vuePourStatut", () => {
  it("JSON.stringify(configResolue) ne contient aucun secret", () => {
    const config = configAvecSecrets();
    const texte = JSON.stringify(config);
    expect(texte).not.toContain(SECRET_CLIENT);
    expect(texte).not.toContain(SECRET_ABONNEMENT);
  });

  it("JSON.stringify(vuePourStatut(config)) ne contient aucun secret ni clé d'abonnement", () => {
    const config = configAvecSecrets();
    const vue = vuePourStatut(config);
    const texte = JSON.stringify(vue);
    expect(texte).not.toContain(SECRET_CLIENT);
    expect(texte).not.toContain(SECRET_ABONNEMENT);
    expect(texte).not.toContain(config.clientId);
  });

  it("util.inspect(config, {depth: null}) ne contient aucun secret", () => {
    const config = configAvecSecrets();
    const texte = inspect(config, { depth: null });
    expect(texte).not.toContain(SECRET_CLIENT);
    expect(texte).not.toContain(SECRET_ABONNEMENT);
  });

  it("une ErreurConfig déclenchée par un secret invalide ne contient pas sa valeur", () => {
    const err = erreurConfigInvalide("La variable EBP_CLIENT_SECRET est invalide.", {
      variable: "EBP_CLIENT_SECRET",
    });
    const texte = JSON.stringify(err.erreur) + err.message;
    expect(texte).not.toContain(SECRET_CLIENT);
  });
});
