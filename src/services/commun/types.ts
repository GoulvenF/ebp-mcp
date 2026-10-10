import type { Famille } from "../../domain/capabilities.js";
import type { Completude, RaisonArret } from "../../domain/envelope.js";
import type { Dossier } from "../../config/dossiers.js";
import type { ContexteHttp, DependancesClientHttp } from "../../http/client.js";
import type { Clock } from "../../ports/clock.js";
import type { ExecutionContext } from "../../ports/execution-context.js";
import type { DepsScan } from "../../pagination/scan.js";
import { erreurFamilleIncompatible } from "./erreurs.js";

/**
 * Dépendances communes de tout service métier (D-T11-1, 07 §1). `http` reste
 * `DependancesClientHttp` existant (`src/http/client.ts`), `scan` reste `DepsScan` existant
 * (`src/pagination/scan.ts`) : ce lot ne les redéfinit pas, il les assemble.
 */
export interface DepsService {
  readonly http: DependancesClientHttp;
  readonly scan: DepsScan;
  readonly clock: Clock;
}

/**
 * Contexte d'un appel de service (D-T11-1, 07 §1) : `dossier` est déjà résolu par l'appelant
 * (T12, `capturerContexteDossier`) — un service ne reçoit jamais deux dossiers et ne lit jamais
 * une autre famille que celle vérifiée par `exigerFamilleOutil`.
 */
export interface ContexteService {
  readonly execution: ExecutionContext;
  readonly http: ContexteHttp;
  readonly dossier: Dossier;
}

/**
 * Résultat commun d'un service métier (D-T11-1, 07 §5) : pas encore l'`Enveloppe` finale (la meta
 * finale — quota, mode, durée, `observe_a`, ventilation api/auth — et la politique PII restent en
 * T12). `tentatives` = budget initial moins budget restant (auth, retries et métier compris).
 */
export interface ResultatService<T> {
  readonly dossier: string;
  readonly resultats: readonly T[];
  readonly bruts: readonly unknown[] | null;
  readonly pagination: {
    readonly renvoyes: number;
    readonly total: number | null;
    readonly total_source: number | null;
    readonly hasMore: boolean;
    readonly curseur: string | null;
  } | null;
  readonly completude: Completude;
  readonly raison_arret: RaisonArret;
  readonly approximatif: boolean;
  readonly avertissements: readonly string[];
  readonly sources: readonly string[];
  readonly appels_source: number;
  readonly tentatives: number;
}

/**
 * Garde de famille (D-T11-1, 07 §6) : refuse `UNSUPPORTED_CAPABILITY` **avant tout réseau** si le
 * dossier du contexte ou la famille HTTP ne correspond pas à l'une des familles acceptées par cet
 * outil. Un service ne lit jamais une autre famille que celle vérifiée ici.
 */
export function exigerFamilleOutil(
  outil: string,
  ctx: ContexteService,
  famillesAcceptees: readonly Famille[],
): void {
  if (ctx.dossier.famille !== ctx.http.famille) {
    throw erreurFamilleIncompatible(outil, ctx.dossier.famille, famillesAcceptees);
  }
  if (!famillesAcceptees.includes(ctx.dossier.famille)) {
    throw erreurFamilleIncompatible(outil, ctx.dossier.famille, famillesAcceptees);
  }
}
