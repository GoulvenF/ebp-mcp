import { createHash, randomBytes } from "node:crypto";

/**
 * PKCE S256 et `state` (décision 6, A06, 07 §3). `node:crypto` uniquement : `randomBytes` pour
 * l'aléa, `createHash` pour le challenge — aucune dépendance npm supplémentaire.
 */
export interface PairePkce {
  readonly verifier: string;
  readonly challenge: string;
}

/** `code_verifier` = base64url(32 octets aléatoires) → 43 caractères, sans padding. */
export function genererVerifier(): string {
  return randomBytes(32).toString("base64url");
}

/** `code_challenge` = base64url(SHA-256(verifier)), méthode S256 uniquement (jamais `plain`). */
export function genererChallenge(verifier: string): string {
  return createHash("sha256").update(verifier, "utf8").digest("base64url");
}

export function genererPairePkce(): PairePkce {
  const verifier = genererVerifier();
  return { verifier, challenge: genererChallenge(verifier) };
}

/** `state` anti-CSRF du callback loopback : 32 octets aléatoires, base64url, usage unique. */
export function genererState(): string {
  return randomBytes(32).toString("base64url");
}
