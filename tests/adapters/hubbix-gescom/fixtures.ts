import { fileURLToPath } from "node:url";
import type { ContexteHttp, DependancesClientHttp } from "../../../dist/index.js";
import { chargerCorpus, trouverParId } from "../../../dist/index.js";
import {
  creerHookTokenFactice,
  creerHorlogeControlee,
  creerQuotaFactice,
  creerTransportFactice,
  type ReponseFactice,
} from "../../http/fixtures.js";

export const REPERTOIRE_CORPUS = fileURLToPath(new URL("../../corpus/ebp", import.meta.url));
export const CORPUS = chargerCorpus(REPERTOIRE_CORPUS);

export function fixtureParId(id: string) {
  const fixture = trouverParId(CORPUS, id);
  if (fixture === undefined) {
    throw new Error(`Fixture "${id}" introuvable dans le corpus.`);
  }
  return fixture;
}

const DEPART = new Date("2026-01-01T00:00:00.000Z");

export function contexteGescom(): ContexteHttp {
  return {
    environnement: "prod",
    famille: "hubbix-gescom",
    dossierId: "dossier-test",
    subscriptionKey: null,
    groupeQuota: "groupe-test",
  };
}

export function budgetDe(restant = 30, deadlineMs = 60_000) {
  const budget = {
    restant,
    deadline: new Date(DEPART.getTime() + deadlineMs),
    consommer(n: number): void {
      budget.restant -= n;
    },
  };
  return budget;
}

/** Dépendances du client HTTP avec un transport factice jouant les réponses programmées dans l'ordre. */
export function deps(reponses: ReponseFactice[]): DependancesClientHttp & { transport: ReturnType<typeof creerTransportFactice> } {
  const transport = creerTransportFactice(reponses);
  const clock = creerHorlogeControlee(DEPART);
  return {
    transport,
    clock,
    quota: creerQuotaFactice(clock),
    hookToken: creerHookTokenFactice({ accessToken: "acc-1", generation: 1 }),
  };
}
