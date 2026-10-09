import type { DependancesCycle, ParametresCycle } from "../auth/cycle.js";
import { assurerTokenValide, invaliderAccessToken } from "../auth/cycle.js";

export interface ResultatToken {
  readonly accessToken: string;
  readonly tentativesAuth: number;
  /** Génération correspondant à `accessToken` si elle a pu être relue, sinon `null` (défensif). */
  readonly generation: number | null;
}

/**
 * Hook token (décision 1/8/12, 07 §4) consommé uniquement par `client.ts`, jamais par un adapter :
 * encapsule `assurerTokenValide`/`invaliderAccessToken` de `src/auth/cycle.ts` sans en modifier le
 * contrat (`ResultatCycle` n'est pas étendu). La génération associée au token obtenu est relue
 * séparément pour permettre une invalidation ciblée après un 401 métier.
 */
export interface HookToken {
  obtenirToken(parametres: ParametresCycle): Promise<ResultatToken>;
  invaliderToken(generation: number): Promise<void>;
}

export function creerHookToken(deps: DependancesCycle): HookToken {
  return {
    async obtenirToken(parametres: ParametresCycle): Promise<ResultatToken> {
      const resultat = await assurerTokenValide(deps, parametres);
      const releve = await deps.tokenStore.read(deps.identite);
      const generation =
        releve !== null && releve.accessToken === resultat.accessToken ? releve.generation : null;
      return { accessToken: resultat.accessToken, tentativesAuth: resultat.tentativesAuth, generation };
    },
    async invaliderToken(generation: number): Promise<void> {
      await invaliderAccessToken(deps, generation);
    },
  };
}
