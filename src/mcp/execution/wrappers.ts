import type { HookToken, ResultatToken } from "../../http/auth-hook.js";
import type { HttpRequestSpec, HttpResponseSpec, HttpTransport } from "../../ports/http-transport.js";
import type { ParametresCycle } from "../../auth/cycle.js";

/** Compteurs d'un appel d'outil (D-T12-6, 07 §5), mutables, créés une fois par appel. */
export interface CompteursAppel {
  appelsApi: number;
  appelsAuth: number;
}

export function creerCompteursAppel(): CompteursAppel {
  return { appelsApi: 0, appelsAuth: 0 };
}

/**
 * Wrapper par appel autour de `HttpTransport` (D-T12-6) : compte chaque départ de transport
 * métier, auth et retries compris — une réponse servie par le cache n'atteint jamais ce wrapper.
 */
export function envelopperTransport(transport: HttpTransport, compteurs: CompteursAppel): HttpTransport {
  return {
    async request(spec: HttpRequestSpec): Promise<HttpResponseSpec> {
      compteurs.appelsApi += 1;
      return transport.request(spec);
    },
  };
}

/**
 * Wrapper par appel autour de `HookToken` (D-T12-6) : `appels_auth` cumule `tentativesAuth`
 * (jamais un simple compte d'appels), aligné sur ce que `budget.consommer` décompte réellement
 * dans `src/http/client.ts`. Un test vérifie `appels_api + appels_auth === tentatives`.
 */
export function envelopperHookToken(hookToken: HookToken, compteurs: CompteursAppel): HookToken {
  return {
    async obtenirToken(parametres: ParametresCycle): Promise<ResultatToken> {
      const resultat = await hookToken.obtenirToken(parametres);
      compteurs.appelsAuth += resultat.tentativesAuth;
      return resultat;
    },
    async invaliderToken(generation: number): Promise<void> {
      return hookToken.invaliderToken(generation);
    },
  };
}
