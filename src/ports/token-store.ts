/** État d'un enregistrement de tokens (07 §3). */
export type EtatToken = "ready" | "refreshing" | "reauth_required";

/** Identité de stockage = profil + environnement + empreinte du client ID (07 §2). */
export interface IdentiteStockage {
  profil: string;
  environnement: "prod" | "preprod";
  empreinteClientId: string;
}

export interface EnregistrementToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  refreshedAt: string;
  refreshExpiresAtEstimate: string | null;
  generation: number;
  state: EtatToken;
}

/** Persistance atomique des tokens (07 §3) ; l'implémentation fichier arrive en T04. */
export interface TokenStore {
  read(identite: IdentiteStockage): Promise<EnregistrementToken | null>;
  write(identite: IdentiteStockage, enregistrement: EnregistrementToken): Promise<void>;
  clear(identite: IdentiteStockage): Promise<void>;
}
