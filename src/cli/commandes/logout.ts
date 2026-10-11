import { logout } from "../../auth/logout.js";
import type { DependancesLogout, ParametresLogout } from "../../auth/logout.js";
import { composerContexteCli } from "../composition.js";
import type { OptionsCliCommunes } from "../composition.js";
import type { DepsCli } from "../types.js";

const DEADLINE_LOGOUT_MS = 30_000;

/** `ebp-mcp logout` (07 §12) : idempotent, aucun appel réseau, `generations.json` conservé. */
export async function executerLogout(options: OptionsCliCommunes, deps: DepsCli): Promise<number> {
  const ctx = await composerContexteCli(options, { env: deps.env, home: deps.home });
  const depsLogout: DependancesLogout = {
    verrous: ctx.verrous,
    store: ctx.store,
    tokenStore: ctx.tokenStore,
    identite: ctx.identiteStockage,
    nomVerrou: ctx.nomVerrouAuth,
    cheminGenerations: ctx.cheminGenerations,
  };
  const parametres: ParametresLogout = {
    deadline: new Date(ctx.depsPartage.clock.now().getTime() + DEADLINE_LOGOUT_MS),
    signal: deps.signal,
  };
  await logout(depsLogout, parametres);
  return 0;
}
