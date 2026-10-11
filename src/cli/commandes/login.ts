import { login } from "../../auth/login.js";
import type { DependancesLogin, ParametresLogin } from "../../auth/login.js";
import { composerContexteCli, creerConsentementMock } from "../composition.js";
import type { OptionsCliCommunes } from "../composition.js";
import { creerOuvrirNavigateurManuel, creerOuvrirNavigateurSysteme } from "../navigateur.js";
import type { DepsCli } from "../types.js";

/** Budget généreux (callback jusqu'à 5 min + un seul échange de token, D-T13-11). */
const DEADLINE_LOGIN_MS = 6 * 60 * 1000;
const BUDGET_LOGIN = 2;

export interface OptionsLogin extends OptionsCliCommunes {
  readonly noBrowser: boolean;
}

/**
 * En live, écrit l'URL d'autorisation sur stderr avant de tenter de l'ouvrir (D-T13-10) ; en mock,
 * le consentement simulé (`creerConsentementMock`) ne passe jamais par ici.
 */
function creerOuvrirNavigateurLive(deps: DepsCli, noBrowser: boolean): (url: string) => Promise<void> {
  const ouvrir = noBrowser ? creerOuvrirNavigateurManuel() : creerOuvrirNavigateurSysteme();
  return async (url: string): Promise<void> => {
    deps.stderr.write(`${url}\n`);
    await ouvrir(url);
  };
}

/**
 * `ebp-mcp login` (07 §12, D-T13-11/D-T13-12) : un signal process (SIGTERM/SIGINT) abandonne
 * `deps.signal`, ce que `login()` traduit en rejet avant tout échange de token — aucun token
 * n'est jamais écrit dans ce cas. Le code de sortie est alors forcé à `1`, jamais `3`
 * (`AUTH_REQUIRED`) : une interruption de signal n'est pas une erreur métier classée.
 */
export async function executerLogin(options: OptionsLogin, deps: DepsCli): Promise<number> {
  const ctx = await composerContexteCli(options, { env: deps.env, home: deps.home });

  const ouvrirNavigateur =
    ctx.identiteMock !== undefined
      ? creerConsentementMock(ctx.identiteMock)
      : creerOuvrirNavigateurLive(deps, options.noBrowser);

  const depsLogin: DependancesLogin = {
    transport: ctx.transport,
    clock: ctx.depsPartage.clock,
    verrous: ctx.verrous,
    store: ctx.store,
    tokenStore: ctx.tokenStore,
    identite: ctx.identiteStockage,
    nomVerrou: ctx.nomVerrouAuth,
    cheminGenerations: ctx.cheminGenerations,
    ouvrirNavigateur,
  };
  const parametres: ParametresLogin = {
    environnement: ctx.config.environnement,
    profilAuth: {
      clientId: ctx.config.clientId,
      ...(ctx.config.clientSecret !== null ? { clientSecret: ctx.config.clientSecret } : {}),
      redirectUri: ctx.config.redirectUri,
      pkce: ctx.config.pkce,
    },
    budgetRestant: BUDGET_LOGIN,
    deadline: new Date(ctx.depsPartage.clock.now().getTime() + DEADLINE_LOGIN_MS),
    signal: deps.signal,
  };

  try {
    await login(depsLogin, parametres);
    return 0;
  } catch (erreur) {
    if (deps.signal.aborted) return 1;
    throw erreur;
  }
}
