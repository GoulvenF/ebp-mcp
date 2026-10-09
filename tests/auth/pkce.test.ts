import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { genererChallenge, genererPairePkce, genererState, genererVerifier } from "../../dist/index.js";

describe("pkce.ts", () => {
  it("genererVerifier produit un verifier base64url de 43 caractères (32 octets)", () => {
    const verifier = genererVerifier();
    expect(verifier).toHaveLength(43);
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("genererChallenge est le SHA-256 base64url du verifier (S256)", () => {
    const verifier = "verifier-fixe-pour-le-test-0123456789abcd";
    const attendu = createHash("sha256").update(verifier, "utf8").digest("base64url");
    expect(genererChallenge(verifier)).toBe(attendu);
  });

  it("genererPairePkce renvoie un couple verifier/challenge cohérent", () => {
    const { verifier, challenge } = genererPairePkce();
    expect(genererChallenge(verifier)).toBe(challenge);
  });

  it("genererState produit 32 octets aléatoires distincts à chaque appel", () => {
    const a = genererState();
    const b = genererState();
    expect(a).not.toBe(b);
    expect(Buffer.from(a, "base64url")).toHaveLength(32);
  });
});
