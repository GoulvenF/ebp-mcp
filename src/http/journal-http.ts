import { randomBytes } from "node:crypto";

/**
 * Une ligne structurée sur `stderr` par tentative (décision 18, 07 §7) : identifiant de requête
 * court, route, famille, méthode, statut, durée, numéro de tentative, raison d'arrêt éventuelle.
 * Jamais d'URL, de query, de segment, de corps ni d'en-tête. `stdout` reste réservé au protocole MCP.
 */
export interface EntreeJournalHttp {
  readonly requeteId: string;
  readonly routeId: string;
  readonly famille: string;
  readonly methode: string;
  readonly statut: number | null;
  readonly dureeMs: number;
  readonly tentative: number;
  readonly raisonArret?: string;
}

export interface JournalHttp {
  tentative(entree: EntreeJournalHttp): void;
}

export function idRequeteCourt(): string {
  return randomBytes(4).toString("hex");
}

export function creerJournalHttpStderr(): JournalHttp {
  return {
    tentative(entree: EntreeJournalHttp): void {
      process.stderr.write(`${JSON.stringify({ type: "http-tentative", ...entree })}\n`);
    },
  };
}
