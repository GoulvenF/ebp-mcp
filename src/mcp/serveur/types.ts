import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { ClaimsIdToken } from "../../auth/client-token.js";
import type { ConfigResolue } from "../../config/resolution.js";
import type { Mode } from "../../domain/envelope.js";
import type { DependancesClientHttp } from "../../http/client.js";
import type { CacheSource } from "../../pagination/cache.js";
import type { Clock } from "../../ports/clock.js";
import type { TokenStore } from "../../ports/token-store.js";
import type { JournalMcp } from "../execution/journal.js";

/**
 * Dépendances partagées par tout le processus MCP (D-T12-10/D-T12-14, 07 §1/§5) : un seul
 * exemplaire pour toutes les sessions. `http.transport`/`http.quota`/`http.hookToken` et `cache`
 * sont partagés tels quels ; seuls `Session` et `MagasinCurseurs` sont créés par session
 * (`construireDepsSession`, `session.ts`). `src/mcp/` ne construit jamais `transport-fetch`
 * lui-même : `http.transport` est toujours injecté par l'appelant.
 */
export interface DepsProcessusPartage {
  readonly config: ConfigResolue;
  readonly http: DependancesClientHttp;
  readonly cache: CacheSource;
  readonly clock: Clock;
  readonly tokenStore: TokenStore;
  readonly journal: JournalMcp;
  /** Claims décodés de l'`id_token` le plus récent (07 §3), transmis tels quels à `ebp_statut` ; absent ⇒ `null`. */
  readonly claims?: ClaimsIdToken | null;
}

/** `mode` obligatoire, sans défaut ni déduction depuis le transport (D-T12-14). */
export interface OptionsServeur {
  readonly mode: Mode;
}

/** Fabrique (D-T12-10) : chaque appel crée un `Server` bas niveau avec sa propre session. */
export type FabriqueServeur = () => Server;
