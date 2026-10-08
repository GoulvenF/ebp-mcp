import { describe, expect, it } from "vitest";
import { lireVariablesEnv } from "../../dist/config/index.js";
import { journalEspion } from "./fixtures.js";

function attendCodeConfigInvalide(fn: () => unknown): void {
  expect(fn).toThrowError(expect.objectContaining({ erreur: expect.objectContaining({ code: "CONFIG_INVALID" }) }));
}

describe("env.ts : liste blanche EBP_*", () => {
  it("variable reconnue vide ⇒ CONFIG_INVALID, jamais de repli", () => {
    attendCodeConfigInvalide(() => lireVariablesEnv({ EBP_CLIENT_ID: "" }, journalEspion()));
  });

  it("variable reconnue blanche ⇒ CONFIG_INVALID", () => {
    attendCodeConfigInvalide(() => lireVariablesEnv({ EBP_CLIENT_ID: "   " }, journalEspion()));
  });

  it("EBP_QUOTA_RESERVE non entier ⇒ CONFIG_INVALID", () => {
    attendCodeConfigInvalide(() => lireVariablesEnv({ EBP_QUOTA_RESERVE: "abc" }, journalEspion()));
  });

  it("EBP_QUOTA_RESERVE négatif ⇒ CONFIG_INVALID", () => {
    attendCodeConfigInvalide(() => lireVariablesEnv({ EBP_QUOTA_RESERVE: "-1" }, journalEspion()));
  });

  it('EBP_REDACT_PII="1" ⇒ CONFIG_INVALID', () => {
    attendCodeConfigInvalide(() => lireVariablesEnv({ EBP_REDACT_PII: "1" }, journalEspion()));
  });

  it('EBP_REDACT_PII="yes" ⇒ CONFIG_INVALID', () => {
    attendCodeConfigInvalide(() => lireVariablesEnv({ EBP_REDACT_PII: "yes" }, journalEspion()));
  });

  it("variable EBP_* inconnue ⇒ avertissement, pas d'échec", () => {
    const journal = journalEspion();
    const resultat = lireVariablesEnv({ EBP_TYPO_INCONNUE: "x" }, journal);
    expect(resultat).toEqual({});
    expect(journal.messages.some((m) => m.includes("EBP_TYPO_INCONNUE"))).toBe(true);
  });

  it("valeurs reconnues valides sont toutes extraites", () => {
    const resultat = lireVariablesEnv(
      {
        EBP_PROFILE: "p1",
        EBP_ENV: "preprod",
        EBP_CLIENT_ID: "cid",
        EBP_CLIENT_SECRET: "sec",
        EBP_SUBSCRIPTION_KEY: "key",
        EBP_REDIRECT_URI: "http://127.0.0.1:1/cb",
        EBP_QUOTA_RESERVE: "10",
        EBP_REDACT_PII: "true",
      },
      journalEspion(),
    );
    expect(resultat).toEqual({
      profile: "p1",
      env: "preprod",
      clientId: "cid",
      clientSecret: "sec",
      subscriptionKey: "key",
      redirectUri: "http://127.0.0.1:1/cb",
      quotaReserve: 10,
      redactPii: true,
    });
  });

  it("EBP_ENV invalide (ni prod ni preprod) ⇒ CONFIG_INVALID", () => {
    attendCodeConfigInvalide(() => lireVariablesEnv({ EBP_ENV: "staging" }, journalEspion()));
  });
});
