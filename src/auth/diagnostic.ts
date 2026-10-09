import type { Environnement } from "../domain/capabilities.js";
import type { EnregistrementToken, EtatToken } from "../ports/token-store.js";
import type { ClaimsIdToken } from "./client-token.js";

export interface ParametresDiagnostic {
  readonly profil: string;
  readonly environnement: Environnement;
  readonly empreinteClient: string;
  readonly enregistrement: EnregistrementToken | null;
  readonly pkce: "required" | "disabled";
  /** Déjà décodés (ex. au login/refresh le plus récent de ce process) ; `null` sinon. */
  readonly claims: ClaimsIdToken | null;
  /** Compteur de tentatives auth du cycle courant, séparé du compteur métier (07 §4). */
  readonly tentativesAuth: number;
}

export interface DiagnosticAuth {
  readonly profil: string;
  readonly environnement: Environnement;
  readonly empreinteClient: string;
  readonly state: EtatToken | "absent";
  readonly expiresAt: string | null;
  readonly refreshExpiresAtEstimate: string | null;
  readonly refreshEstime: true;
  readonly generation: number | null;
  readonly pkce: "required" | "disabled";
  readonly claims: ClaimsIdToken | null;
  readonly claimsVerifies: false;
  readonly tentativesAuth: number;
}

/**
 * Fonction pure (données de `status`, 07 §3/§8) : ne sérialise jamais access/refresh token,
 * `client_secret`, `subscriptionKey` ni `clientId` en clair — uniquement `empreinteClient`.
 */
export function diagnostiquerAuth(parametres: ParametresDiagnostic): DiagnosticAuth {
  return {
    profil: parametres.profil,
    environnement: parametres.environnement,
    empreinteClient: parametres.empreinteClient,
    state: parametres.enregistrement?.state ?? "absent",
    expiresAt: parametres.enregistrement?.expiresAt ?? null,
    refreshExpiresAtEstimate: parametres.enregistrement?.refreshExpiresAtEstimate ?? null,
    refreshEstime: true,
    generation: parametres.enregistrement?.generation ?? null,
    pkce: parametres.pkce,
    claims: parametres.claims,
    claimsVerifies: false,
    tentativesAuth: parametres.tentativesAuth,
  };
}
