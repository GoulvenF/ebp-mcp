import { z } from "zod";
import type { Environnement } from "../domain/capabilities.js";
import type { Clock } from "../ports/clock.js";
import type { HttpTransport } from "../ports/http-transport.js";
import type { Secret } from "../config/secret.js";
import { erreurArgumentInvalide } from "./errors.js";
import { estOrigineIdentiteAutorisee, urlToken } from "./origines.js";

/**
 * Échéance conservatrice si `expires_in` est absent/invalide (décision 7, 07 §3). Documentée ici
 * en constante plutôt qu'en littéral dispersé.
 */
export const EXPIRES_IN_DEFAUT_S = 300;

/** 30 jours, en millisecondes, pour l'estimation `refreshExpiresAtEstimate` (décision 7). */
export const REFRESH_ESTIME_MS = 30 * 24 * 60 * 60 * 1000;

/** Une requête de 15 s maximum, bornée par le temps restant avant la deadline de l'appelant. */
export const TIMEOUT_REQUETE_TOKEN_MS = 15_000;

export interface ClaimsIdToken {
  readonly email?: string;
  readonly nom?: string;
}

const schemaReponseToken = z
  .object({
    access_token: z.string().min(1),
    refresh_token: z.string().min(1).optional(),
    expires_in: z.union([z.number(), z.string()]).optional(),
    id_token: z.string().optional(),
    token_type: z.string().optional(),
    scope: z.string().optional(),
  })
  .loose();

function enEntier(valeur: unknown): number | null {
  if (typeof valeur === "number") {
    return Number.isInteger(valeur) ? valeur : null;
  }
  if (typeof valeur === "string" && /^-?\d+$/.test(valeur)) {
    return Number.parseInt(valeur, 10);
  }
  return null;
}

/** `expires_in` valide (entier ou chaîne d'entier) dans [1,3600] ; sinon `EXPIRES_IN_DEFAUT_S`. */
export function resoudreExpiresIn(valeur: unknown): number {
  const entier = enEntier(valeur);
  if (entier === null || entier < 1 || entier > 3600) {
    return EXPIRES_IN_DEFAUT_S;
  }
  return entier;
}

/**
 * Décode (sans vérifier la signature) les claims utiles d'un `id_token` JWT, pour affichage local
 * uniquement (décision 7, jamais pour autorisation). Renvoie `null` si le jeton est absent ou mal
 * formé — ne jette jamais : un `id_token` dégradé ne doit jamais faire échouer l'échange.
 */
export function decoderClaimsPourAffichage(idToken: string | undefined): ClaimsIdToken | null {
  if (idToken === undefined) return null;
  const parties = idToken.split(".");
  if (parties.length !== 3) return null;
  try {
    const segment = parties[1] as string;
    const payload = Buffer.from(segment, "base64url").toString("utf8");
    const brut = JSON.parse(payload) as Record<string, unknown>;
    const email = typeof brut["ebp.email"] === "string" ? (brut["ebp.email"] as string) : undefined;
    const prenom = typeof brut["given_name"] === "string" ? (brut["given_name"] as string) : undefined;
    const nomFamille = typeof brut["family_name"] === "string" ? (brut["family_name"] as string) : undefined;
    const nom = [prenom, nomFamille].filter((partie): partie is string => partie !== undefined).join(" ");
    const resultat: ClaimsIdToken = {};
    if (email !== undefined) (resultat as { email?: string }).email = email;
    if (nom.length > 0) (resultat as { nom?: string }).nom = nom;
    return resultat;
  } catch {
    return null;
  }
}

export type ParametresEchangeToken =
  | {
      readonly grant: "authorization_code";
      readonly clientId: string;
      readonly clientSecret?: Secret;
      readonly redirectUri: string;
      readonly code: string;
      readonly codeVerifier?: string;
    }
  | {
      readonly grant: "refresh_token";
      readonly clientId: string;
      readonly clientSecret?: Secret;
      readonly refreshToken: string;
    };

export interface DependancesClientToken {
  readonly transport: HttpTransport;
  readonly clock: Clock;
}

/** Fenêtre d'exécution minimale consommée par un échange token (sous-ensemble d'ExecutionContext). */
export interface FenetreExecution {
  readonly budgetRestant: number;
  readonly deadline: Date;
  readonly signal?: AbortSignal;
}

export type CategorieEchecToken =
  | "budget_epuise"
  | "deadline_depassee"
  | "annule"
  | "reseau"
  | "malformee"
  | "invalid_grant"
  | "http";

export interface EchecEchangeToken {
  readonly ok: false;
  readonly categorie: CategorieEchecToken;
  readonly statutHttp?: number;
}

export interface SuccesEchangeToken {
  readonly ok: true;
  readonly accessToken: string;
  /** `null` si absent de la réponse (le code appelant décide AUTH_REQUIRED vs reauth_required). */
  readonly refreshToken: string | null;
  readonly expiresInSecondes: number;
  readonly claims: ClaimsIdToken | null;
}

export type ResultatEchangeToken = SuccesEchangeToken | EchecEchangeToken;

function corpsFormulaire(champs: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  for (const [cle, valeur] of Object.entries(champs)) {
    if (valeur !== undefined) params.set(cle, valeur);
  }
  return params.toString();
}

function construireCorps(params: ParametresEchangeToken): string {
  if (params.grant === "authorization_code") {
    return corpsFormulaire({
      grant_type: "authorization_code",
      client_id: params.clientId,
      client_secret: params.clientSecret?.reveler(),
      redirect_uri: params.redirectUri,
      code: params.code,
      code_verifier: params.codeVerifier,
    });
  }
  return corpsFormulaire({
    grant_type: "refresh_token",
    client_id: params.clientId,
    client_secret: params.clientSecret?.reveler(),
    refresh_token: params.refreshToken,
  });
}

/**
 * Exécute `transport.request` sous un budget de temps, sans jamais utiliser `setTimeout` : le
 * minuteur est `Clock.wait`, annulé dès que la requête se termine. Combine aussi le `signal`
 * externe de l'appelant.
 */
async function requeteAvecTimeout(
  deps: DependancesClientToken,
  signalExterne: AbortSignal | undefined,
  timeoutMs: number,
  url: string,
  corps: string,
): Promise<{ ok: true; status: number; corps: string } | { ok: false; expire: boolean }> {
  const combineur = new AbortController();
  const onAbortExterne = (): void => combineur.abort();
  signalExterne?.addEventListener("abort", onAbortExterne, { once: true });

  const minuteur = new AbortController();
  let expire = false;
  const attenteMinuteur = deps.clock.wait(timeoutMs, minuteur.signal).then(() => {
    if (!minuteur.signal.aborted) {
      expire = true;
      combineur.abort();
    }
  });

  try {
    const reponse = await deps.transport.request({
      method: "POST",
      url,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: corps,
      signal: combineur.signal,
    });
    return { ok: true, status: reponse.status, corps: reponse.body };
  } catch {
    return { ok: false, expire };
  } finally {
    minuteur.abort();
    signalExterne?.removeEventListener("abort", onAbortExterne);
    await attenteMinuteur.catch(() => undefined);
  }
}

/**
 * Un seul échange `/connect/token`, **aucun retry** (décision 2, 07 §3/§4) : échec réseau, timeout
 * ou 5xx ne sont jamais rejoués ici. Refuse toute URL hors de l'hôte identité et toute méthode
 * autre que POST (décision 1). Consomme le budget de l'appelant (une tentative) et respecte sa
 * deadline : budget épuisé ou deadline dépassée ⇒ erreur avant toute émission réseau.
 */
export async function echangerToken(
  deps: DependancesClientToken,
  fenetre: FenetreExecution,
  environnement: Environnement,
  params: ParametresEchangeToken,
): Promise<ResultatEchangeToken> {
  if (fenetre.signal?.aborted === true) {
    return { ok: false, categorie: "annule" };
  }
  if (fenetre.budgetRestant < 1) {
    return { ok: false, categorie: "budget_epuise" };
  }
  const maintenant = deps.clock.now();
  const restant = fenetre.deadline.getTime() - maintenant.getTime();
  if (restant <= 0) {
    return { ok: false, categorie: "deadline_depassee" };
  }

  const url = urlToken(environnement);
  if (!estOrigineIdentiteAutorisee(url)) {
    throw erreurArgumentInvalide(
      "URL de l'échange token hors de l'hôte identité autorisé.",
      "Signaler ce bug ; aucune requête n'a été émise.",
    );
  }

  const corps = construireCorps(params);
  const timeoutMs = Math.min(TIMEOUT_REQUETE_TOKEN_MS, restant);
  const resultat = await requeteAvecTimeout(deps, fenetre.signal, timeoutMs, url, corps);

  if (!resultat.ok) {
    return { ok: false, categorie: "reseau" };
  }

  if (resultat.status !== 200) {
    let corpsErreur: { error?: unknown } = {};
    try {
      corpsErreur = JSON.parse(resultat.corps) as { error?: unknown };
    } catch {
      corpsErreur = {};
    }
    if (corpsErreur.error === "invalid_grant") {
      return { ok: false, categorie: "invalid_grant", statutHttp: resultat.status };
    }
    return { ok: false, categorie: "http", statutHttp: resultat.status };
  }

  let brut: unknown;
  try {
    brut = JSON.parse(resultat.corps);
  } catch {
    return { ok: false, categorie: "malformee" };
  }
  const analyse = schemaReponseToken.safeParse(brut);
  if (!analyse.success) {
    return { ok: false, categorie: "malformee" };
  }

  const donnees = analyse.data;
  return {
    ok: true,
    accessToken: donnees.access_token,
    refreshToken: donnees.refresh_token ?? null,
    expiresInSecondes: resoudreExpiresIn(donnees.expires_in),
    claims: decoderClaimsPourAffichage(donnees.id_token),
  };
}
