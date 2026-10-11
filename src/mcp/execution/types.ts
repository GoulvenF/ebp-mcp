import type { ConfigResolue } from "../../config/resolution.js";
import type { Session } from "../../config/session.js";
import type { Mode } from "../../domain/envelope.js";
import type { DependancesClientHttp } from "../../http/client.js";
import type { DepsScan } from "../../pagination/scan.js";
import type { MagasinCurseurs } from "../../pagination/curseurs.js";
import type { Clock } from "../../ports/clock.js";
import type { TokenStore } from "../../ports/token-store.js";
import type { PolitiqueSortie } from "../sortie/politique-pii.js";
import type { JournalMcp } from "./journal.js";

/** Session MCP d'un appel (livrable de ce lot, 07 §1) : état de dossier choisi + curseurs en mémoire. */
export interface SessionMcp {
  readonly session: Session;
  readonly curseurs: MagasinCurseurs;
}

/**
 * Dépendances du processus MCP (D-T12-14, 07 §1/§5) : toutes injectées, jamais construites dans
 * `src/mcp/` (`transport-fetch` en particulier reste hors de ce module). `http.quota` sert à la
 * fois à l'admission (client HTTP) et à la lecture `meta.quota_*` (D-T12-6).
 */
export interface DepsProcessus {
  readonly config: ConfigResolue;
  readonly http: DependancesClientHttp;
  readonly scan: DepsScan;
  readonly clock: Clock;
  readonly tokenStore: TokenStore;
  readonly journal: JournalMcp;
}

/**
 * Options d'exécution d'un appel (D-T12-14, 07 §5/§8) : `mode` est obligatoire, sans défaut ni
 * déduction depuis le transport ; `politique` est un paramètre de l'appel, pas un état global
 * (D-T12-8). `signal` reprend `extra.signal` de la requête MCP (lot 3) ; un signal toujours actif
 * est utilisé par défaut hors de ce contexte (tests, outils de contexte sans annulation externe).
 */
export interface OptionsExecution {
  readonly mode: Mode;
  readonly politique: PolitiqueSortie;
  readonly signal?: AbortSignal;
}
