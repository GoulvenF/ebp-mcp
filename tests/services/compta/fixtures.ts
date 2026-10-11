import type { ContexteService, DepsService, Identifiant } from "../../../dist/index.js";
import { CacheSource, MagasinCurseurs } from "../../../dist/index.js";
import {
  creerHookTokenFactice,
  creerHorlogeControlee,
  creerQuotaFactice,
  creerTransportFactice,
  type ReponseFactice,
} from "../../http/fixtures.js";

const DEPART = new Date("2026-01-01T00:00:00.000Z");
const ALIAS_TEST = "alias-test" as Identifiant;

/** Assemble un `DepsService` complet (D-T11-1) au-dessus d'un transport factice compteur. */
export function depsDe(
  reponses: ReponseFactice[] = [],
): DepsService & { transport: ReturnType<typeof creerTransportFactice> } {
  const clock = creerHorlogeControlee(DEPART);
  const transport = creerTransportFactice(reponses);
  const http = {
    transport,
    clock,
    quota: creerQuotaFactice(clock),
    hookToken: creerHookTokenFactice({ accessToken: "acc-1", generation: 1 }),
  };
  return {
    http,
    scan: { curseurs: new MagasinCurseurs(clock), cache: new CacheSource(clock), clock },
    clock,
    transport,
  };
}

/** `ContexteService` minimal pour un dossier CPT (`hubbix-compta`) par défaut. */
export function ctxDe(overrides: Partial<ContexteService> = {}): ContexteService {
  return {
    execution: {
      profil: "profil-test",
      environnement: "prod",
      identiteGeneration: 1,
      dossier: "dossier-cpt-test",
      budgetRestant: 30,
      deadline: new Date(DEPART.getTime() + 60_000),
      signal: new AbortController().signal,
    },
    http: {
      environnement: "prod",
      famille: "hubbix-compta",
      dossierId: "dossier-cpt-test",
      subscriptionKey: null,
      groupeQuota: "groupe-test",
    },
    dossier: { alias: ALIAS_TEST, famille: "hubbix-compta", id: "dossier-cpt-test", nom: null },
    ...overrides,
  };
}

/** Même contexte, mais sur un dossier GesCom (`hubbix-gescom`). */
export function ctxGcDe(overrides: Partial<ContexteService> = {}): ContexteService {
  return ctxDe({
    http: {
      environnement: "prod",
      famille: "hubbix-gescom",
      dossierId: "dossier-gc-test",
      subscriptionKey: null,
      groupeQuota: "groupe-test",
    },
    dossier: { alias: ALIAS_TEST, famille: "hubbix-gescom", id: "dossier-gc-test", nom: null },
    ...overrides,
  });
}
