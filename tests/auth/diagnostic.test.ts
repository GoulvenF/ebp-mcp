import { describe, expect, it } from "vitest";
import { diagnostiquerAuth } from "../../dist/index.js";

describe("diagnostic.ts", () => {
  it("forme exacte attendue avec un enregistrement présent", () => {
    const diagnostic = diagnostiquerAuth({
      profil: "default",
      environnement: "prod",
      empreinteClient: "empreinte-abc",
      enregistrement: {
        accessToken: "access-secret",
        refreshToken: "refresh-secret",
        expiresAt: "2026-01-01T01:00:00.000Z",
        refreshedAt: "2026-01-01T00:00:00.000Z",
        refreshExpiresAtEstimate: "2026-01-31T00:00:00.000Z",
        generation: 3,
        state: "ready",
      },
      pkce: "required",
      claims: { email: "user@example.com", nom: "Jean Dupont" },
      tentativesAuth: 2,
    });

    expect(diagnostic).toEqual({
      profil: "default",
      environnement: "prod",
      empreinteClient: "empreinte-abc",
      state: "ready",
      expiresAt: "2026-01-01T01:00:00.000Z",
      refreshExpiresAtEstimate: "2026-01-31T00:00:00.000Z",
      refreshEstime: true,
      generation: 3,
      pkce: "required",
      claims: { email: "user@example.com", nom: "Jean Dupont" },
      claimsVerifies: false,
      tentativesAuth: 2,
    });
  });

  it("enregistrement absent : state 'absent', champs temporels/génération null", () => {
    const diagnostic = diagnostiquerAuth({
      profil: "default",
      environnement: "preprod",
      empreinteClient: "empreinte-abc",
      enregistrement: null,
      pkce: "disabled",
      claims: null,
      tentativesAuth: 0,
    });

    expect(diagnostic.state).toBe("absent");
    expect(diagnostic.expiresAt).toBeNull();
    expect(diagnostic.refreshExpiresAtEstimate).toBeNull();
    expect(diagnostic.generation).toBeNull();
    expect(diagnostic.claims).toBeNull();
    expect(diagnostic.claimsVerifies).toBe(false);
  });

  it("aucune valeur sensible n'apparaît dans JSON.stringify du diagnostic", () => {
    const diagnostic = diagnostiquerAuth({
      profil: "default",
      environnement: "prod",
      empreinteClient: "empreinte-abc",
      enregistrement: {
        accessToken: "ACCESS-TOKEN-SECRET-NE-DOIT-JAMAIS-APPARAITRE",
        refreshToken: "REFRESH-TOKEN-SECRET-NE-DOIT-JAMAIS-APPARAITRE",
        expiresAt: "2026-01-01T01:00:00.000Z",
        refreshedAt: "2026-01-01T00:00:00.000Z",
        refreshExpiresAtEstimate: "2026-01-31T00:00:00.000Z",
        generation: 1,
        state: "ready",
      },
      pkce: "required",
      claims: { email: "user@example.com" },
      tentativesAuth: 1,
    });

    const serialise = JSON.stringify(diagnostic);
    expect(serialise).not.toContain("ACCESS-TOKEN-SECRET");
    expect(serialise).not.toContain("REFRESH-TOKEN-SECRET");
    expect(serialise).not.toContain("accessToken");
    expect(serialise).not.toContain("refreshToken");
    expect(serialise).not.toContain("clientSecret");
    expect(serialise).not.toContain("subscriptionKey");
    expect(serialise).not.toContain("clientId");
  });
});
