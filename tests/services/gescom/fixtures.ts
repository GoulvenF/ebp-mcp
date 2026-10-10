import { CacheSource, MagasinCurseurs } from "../../../dist/index.js";
import type { ContexteHttp, ContexteService, DepsScan, DepsService, Dossier, Identifiant } from "../../../dist/index.js";
import { creerHorlogeControlee, type HorlogeControlee } from "../../auth/fixtures.js";
import { creerHookTokenFactice, creerQuotaFactice, creerTransportFactice, type ReponseFactice } from "../../http/fixtures.js";

export const DEPART = new Date("2026-01-01T00:00:00.000Z");
/** Lointaine, pour rester valable même quand un test avance l'horloge contrôlée (ex. échéancier). */
const DEADLINE_LOINTAINE = new Date("2099-01-01T00:00:00.000Z");

export function deps(reponses: ReponseFactice[]) {
  const transport = creerTransportFactice(reponses);
  const clock = creerHorlogeControlee(DEPART);
  return {
    transport,
    clock,
    quota: creerQuotaFactice(clock),
    hookToken: creerHookTokenFactice({ accessToken: "acc-1", generation: 1 }),
  };
}

export function contexteHttpGescom(): ContexteHttp {
  return {
    environnement: "prod",
    famille: "hubbix-gescom",
    dossierId: "dossier-test",
    subscriptionKey: null,
    groupeQuota: "groupe-test",
  };
}

export function contexteHttpCompta(): ContexteHttp {
  return {
    environnement: "prod",
    famille: "hubbix-compta",
    dossierId: "dossier-test",
    subscriptionKey: null,
    groupeQuota: "groupe-test",
  };
}

export function dossierGescom(): Dossier {
  return { alias: "gc-test" as Identifiant, famille: "hubbix-gescom", id: "dossier-test", nom: null };
}

export function dossierCompta(): Dossier {
  return { alias: "cpt-test" as Identifiant, famille: "hubbix-compta", id: "dossier-test", nom: null };
}

/** `ContexteService` complet pour un service GC (D-T11-1), prêt à l'emploi dans les tests. */
export function ctxGescom(overrides: { budgetRestant?: number; dossier?: Dossier } = {}): ContexteService {
  return {
    execution: {
      profil: "profil-test",
      environnement: "prod",
      identiteGeneration: 1,
      dossier: "dossier-test",
      budgetRestant: overrides.budgetRestant ?? 30,
      deadline: DEADLINE_LOINTAINE,
      signal: new AbortController().signal,
    },
    http: contexteHttpGescom(),
    dossier: overrides.dossier ?? dossierGescom(),
  };
}

/** `ContexteService` dont le dossier est de famille CPT, pour prouver le refus avant réseau (A03). */
export function ctxComptaSurOutilGc(): ContexteService {
  return {
    execution: {
      profil: "profil-test",
      environnement: "prod",
      identiteGeneration: 1,
      dossier: "dossier-test",
      budgetRestant: 30,
      deadline: DEADLINE_LOINTAINE,
      signal: new AbortController().signal,
    },
    http: contexteHttpCompta(),
    dossier: dossierCompta(),
  };
}

/** `DepsService` complet, avec un transport factice jouant les réponses programmées dans l'ordre. */
export function depsService(
  reponses: ReponseFactice[],
): Omit<DepsService, "clock"> & { readonly clock: HorlogeControlee; readonly transport: ReturnType<typeof creerTransportFactice> } {
  const http = deps(reponses);
  const horloge = creerHorlogeControlee(DEPART);
  const scan: DepsScan = { curseurs: new MagasinCurseurs(horloge), cache: new CacheSource(horloge), clock: horloge };
  return { http, scan, clock: horloge, transport: http.transport };
}
