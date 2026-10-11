import type { ContexteService, DepsService, Identifiant } from "../../../dist/index.js";
import { CacheSource, MagasinCurseurs } from "../../../dist/index.js";
import { creerHorlogeControlee, type HorlogeControlee } from "../../auth/fixtures.js";
import { creerHookTokenFactice, creerQuotaFactice, creerTransportFactice, type ReponseFactice } from "../../http/fixtures.js";

export const DEPART = new Date("2026-01-01T00:00:00.000Z");
export const ALIAS_DOSSIER_CPT = "dossier-cpt-test" as Identifiant;

/** `DepsService` (D-T11-1) avec un transport factice compteur : prouve « 0 appel transport » (07 §4). */
export function depsServiceDe(
  reponses: ReponseFactice[],
  horloge: HorlogeControlee = creerHorlogeControlee(DEPART),
): DepsService & { transport: ReturnType<typeof creerTransportFactice> } {
  const transport = creerTransportFactice(reponses);
  const clock = horloge;
  return {
    http: {
      transport,
      clock,
      quota: creerQuotaFactice(clock),
      hookToken: creerHookTokenFactice({ accessToken: "acc-1", generation: 1 }),
    },
    scan: { curseurs: new MagasinCurseurs(clock), cache: new CacheSource(clock), clock },
    clock,
    transport,
  };
}

/** Contexte de service CPT (D-T11-1), `budgetRestant` ajustable pour les scénarios d'épuisement. */
export function contexteServiceCompta(
  overrides: { budgetRestant?: number; famille?: "hubbix-compta" | "hubbix-gescom"; familleHttp?: "hubbix-compta" | "hubbix-gescom" } = {},
): ContexteService {
  const famille = overrides.famille ?? "hubbix-compta";
  const familleHttp = overrides.familleHttp ?? famille;
  return {
    execution: {
      profil: "profil-test",
      environnement: "prod",
      identiteGeneration: 1,
      dossier: "dossier-cpt-test",
      budgetRestant: overrides.budgetRestant ?? 30,
      deadline: new Date(DEPART.getTime() + 60_000),
      signal: new AbortController().signal,
    },
    http: {
      environnement: "prod",
      famille: familleHttp,
      dossierId: "dossier-cpt-test",
      subscriptionKey: null,
      groupeQuota: "groupe-test",
    },
    dossier: { alias: ALIAS_DOSSIER_CPT, famille, id: "dossier-cpt-test", nom: null },
  };
}

/** Ligne brute `/lines-entries` (02 §2) : mêmes champs que les fixtures de l'adapter T09, surchargeables. */
export function ligneBrute(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    entry: { journal: "VE", date: "2026-01-15", entryMode: "Validé" },
    generalAccount: "411000",
    auxiliaryAccount: null,
    label: "Ligne test",
    debit: null,
    credit: null,
    piece: "P1",
    document: null,
    deadline: null,
    lettering: null,
    ...overrides,
  };
}
