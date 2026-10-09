import type { Environnement } from "../domain/capabilities.js";
import type { Clock } from "../ports/clock.js";
import type { HttpTransport } from "../ports/http-transport.js";
import type { LockManager } from "../ports/lock-manager.js";
import type { EnregistrementToken, IdentiteStockage, TokenStore } from "../ports/token-store.js";
import type { Secret } from "../config/secret.js";
import type { JournalStockage, StoreJson } from "../storage/store-json.js";
import { mettreAJourSousVerrou } from "../storage/transaction.js";
import { attendreCallback } from "./callback-loopback.js";
import type { ClaimsIdToken } from "./client-token.js";
import { REFRESH_ESTIME_MS, echangerToken } from "./client-token.js";
import { erreurAuthRequise } from "./errors.js";
import { urlAutorize } from "./origines.js";
import { genererPairePkce, genererState } from "./pkce.js";
import type { EtatGenerations } from "./store-generations.js";
import {
  TYPE_GENERATIONS,
  apresReservation,
  commitAutorise,
  lireGenerations,
  sousVerrouIdentite,
} from "./store-generations.js";

const SCOPE = "openid profile offline_access";
const TIMEOUT_CALLBACK_MAX_MS = 5 * 60 * 1000;

export interface ProfilAuthLogin {
  readonly clientId: string;
  readonly clientSecret?: Secret;
  readonly redirectUri: string;
  readonly pkce: "required" | "disabled";
}

export interface DependancesLogin {
  readonly transport: HttpTransport;
  readonly clock: Clock;
  readonly verrous: LockManager;
  readonly store: StoreJson;
  readonly tokenStore: TokenStore;
  readonly identite: IdentiteStockage;
  readonly nomVerrou: string;
  readonly cheminGenerations: string;
  /** Ouvre le navigateur sur l'URL d'autorisation ; affiche aussi l'URL (fallback sans navigateur). */
  readonly ouvrirNavigateur: (url: string) => Promise<void>;
  readonly journal?: JournalStockage;
}

export interface ParametresLogin {
  readonly environnement: Environnement;
  readonly profilAuth: ProfilAuthLogin;
  readonly budgetRestant: number;
  readonly deadline: Date;
  readonly signal?: AbortSignal;
}

export interface ResultatLogin {
  readonly enregistrement: EnregistrementToken;
  readonly claims: ClaimsIdToken | null;
  readonly tentativesAuth: number;
}

function construireUrlAutorize(
  environnement: Environnement,
  profilAuth: ProfilAuthLogin,
  state: string,
  challenge: string | undefined,
): string {
  const url = new URL(urlAutorize(environnement));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("client_id", profilAuth.clientId);
  url.searchParams.set("redirect_uri", profilAuth.redirectUri);
  url.searchParams.set("scope", SCOPE);
  url.searchParams.set("state", state);
  if (challenge !== undefined) {
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
  }
  return url.toString();
}

/**
 * Parcours `login` complet (03 §login, 07 §3, A06) : génère `state` + PKCE S256 (sauf mode
 * `disabled`, qui n'envoie jamais de `code_challenge`), ouvre le navigateur, attend l'unique
 * callback valide, échange le code en un seul appel réseau (aucune seconde tentative automatique
 * sans PKCE), puis réserve une génération et ne commite `tokens.json` que si elle est toujours
 * valide au moment du commit (A05 : une déconnexion concurrente invalide la réservation).
 */
export async function login(deps: DependancesLogin, parametres: ParametresLogin): Promise<ResultatLogin> {
  const { profilAuth } = parametres;
  const state = genererState();
  const { verifier, challenge } = genererPairePkce();
  const challengeEnvoye = profilAuth.pkce === "required" ? challenge : undefined;
  const verifierEnvoye = profilAuth.pkce === "required" ? verifier : undefined;

  const urlAuth = construireUrlAutorize(parametres.environnement, profilAuth, state, challengeEnvoye);

  const maintenantDebut = deps.clock.now();
  const restantAvantDeadline = parametres.deadline.getTime() - maintenantDebut.getTime();
  if (restantAvantDeadline <= 0) {
    throw erreurAuthRequise("Deadline déjà dépassée avant l'ouverture du navigateur.", "Relancer `ebp-mcp login`.");
  }
  const timeoutCallbackMs = Math.min(TIMEOUT_CALLBACK_MAX_MS, restantAvantDeadline);

  await deps.ouvrirNavigateur(urlAuth);

  const callback = await attendreCallback(
    { clock: deps.clock },
    profilAuth.redirectUri,
    state,
    timeoutCallbackMs,
    parametres.signal,
  );

  let tentativesAuth = 0;
  const resultatEchange = await echangerToken(
    { transport: deps.transport, clock: deps.clock },
    {
      budgetRestant: parametres.budgetRestant,
      deadline: parametres.deadline,
      ...(parametres.signal !== undefined ? { signal: parametres.signal } : {}),
    },
    parametres.environnement,
    {
      grant: "authorization_code",
      clientId: profilAuth.clientId,
      ...(profilAuth.clientSecret !== undefined ? { clientSecret: profilAuth.clientSecret } : {}),
      redirectUri: profilAuth.redirectUri,
      code: callback.code,
      ...(verifierEnvoye !== undefined ? { codeVerifier: verifierEnvoye } : {}),
    },
  );
  tentativesAuth += 1;

  if (!resultatEchange.ok) {
    throw erreurAuthRequise(
      resultatEchange.categorie === "invalid_grant"
        ? "Code d'autorisation rejeté par EBP (invalid_grant)."
        : "Échec de l'échange du code d'autorisation (réseau, timeout ou réponse invalide).",
      "Relancer `ebp-mcp login`.",
    );
  }
  if (resultatEchange.refreshToken === null) {
    throw erreurAuthRequise(
      "Réponse de connexion sans refresh_token.",
      "Relancer `ebp-mcp login` ; vérifier que le scope offline_access est bien accordé.",
    );
  }

  const generation = await mettreAJourSousVerrou<EtatGenerations>(
    {
      verrous: deps.verrous,
      store: deps.store,
      nomVerrou: deps.nomVerrou,
      chemin: deps.cheminGenerations,
      type: TYPE_GENERATIONS,
      deadline: parametres.deadline,
      ...(parametres.signal !== undefined ? { signal: parametres.signal } : {}),
      ...(deps.journal !== undefined ? { journal: deps.journal } : {}),
    },
    (actuel) => apresReservation(actuel),
  ).then((etat) => etat.derniereReservee);

  const maintenant = deps.clock.now();
  const enregistrement: EnregistrementToken = {
    accessToken: resultatEchange.accessToken,
    refreshToken: resultatEchange.refreshToken,
    expiresAt: new Date(maintenant.getTime() + resultatEchange.expiresInSecondes * 1000).toISOString(),
    refreshedAt: maintenant.toISOString(),
    refreshExpiresAtEstimate: new Date(maintenant.getTime() + REFRESH_ESTIME_MS).toISOString(),
    generation,
    state: "ready",
  };

  let commis = false;
  await sousVerrouIdentite(
    deps.verrous,
    deps.nomVerrou,
    parametres.deadline,
    parametres.signal,
    deps.journal,
    async () => {
      const etatGenerations = await lireGenerations({ store: deps.store, chemin: deps.cheminGenerations });
      if (!commitAutorise(etatGenerations, generation)) {
        commis = false;
        return;
      }
      await deps.tokenStore.write(deps.identite, enregistrement);
      commis = true;
    },
  );

  if (!commis) {
    throw erreurAuthRequise(
      "Connexion invalidée par une déconnexion concurrente avant son enregistrement.",
      "Relancer `ebp-mcp login`.",
    );
  }

  return { enregistrement, claims: resultatEchange.claims, tentativesAuth };
}
