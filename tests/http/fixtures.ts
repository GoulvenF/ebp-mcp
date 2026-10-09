import { createServer } from "node:http";
import type { Server } from "node:http";
import type {
  Clock,
  HttpRequestSpec,
  HttpResponseSpec,
  HttpTransport,
  QuotaStore,
  StatutQuota,
} from "../../dist/index.js";
import { erreurDeadlineInsuffisante, erreurQuotaAnnule } from "../../dist/index.js";
import type { HookToken, ResultatToken } from "../../dist/index.js";
import type { ParametresCycle } from "../../dist/index.js";

export { creerHorlogeControlee, type HorlogeControlee } from "../auth/fixtures.js";
import type { HorlogeControlee } from "../auth/fixtures.js";

/** Horloge instrumentée : journalise chaque `wait(durationMs, …)`, dans l'ordre des appels. */
export function instrumenterHorloge(base: HorlogeControlee): HorlogeControlee & { attentes: number[] } {
  const attentes: number[] = [];
  return {
    attentes,
    now: () => base.now(),
    avancer: (ms: number) => base.avancer(ms),
    definir: (date: Date) => base.definir(date),
    wait(duree: number, signal?: AbortSignal) {
      attentes.push(duree);
      return base.wait(duree, signal);
    },
  };
}

export type ReponseFactice =
  | { readonly status: number; readonly headers?: Record<string, string>; readonly corps: unknown }
  | { readonly erreurReseau: true };

/** Transport factice générique (requêtes métier) : consomme les réponses programmées dans l'ordre. */
export function creerTransportFactice(reponses: ReponseFactice[]): HttpTransport & { appels: HttpRequestSpec[] } {
  const appels: HttpRequestSpec[] = [];
  const file = [...reponses];
  return {
    appels,
    async request(spec: HttpRequestSpec): Promise<HttpResponseSpec> {
      appels.push(spec);
      const programmee = file.shift();
      if (programmee === undefined) {
        throw new Error("Transport factice : aucune réponse programmée (appel inattendu).");
      }
      if ("erreurReseau" in programmee) {
        throw new Error("Échec réseau simulé.");
      }
      return {
        status: programmee.status,
        headers: programmee.headers ?? {},
        body: JSON.stringify(programmee.corps),
      };
    },
  };
}

/** Transport dont la requête ne se résout jamais, sauf abandon via le signal (tests de timeout/annulation). */
export function creerTransportJamaisResolu(): HttpTransport & { appels: HttpRequestSpec[] } {
  const appels: HttpRequestSpec[] = [];
  return {
    appels,
    request(spec: HttpRequestSpec): Promise<HttpResponseSpec> {
      appels.push(spec);
      return new Promise((_resolve, reject) => {
        spec.signal?.addEventListener("abort", () => reject(new Error("Requête annulée.")), { once: true });
      });
    },
  };
}

interface EtatGroupeFactice {
  cooldownFin: Date | null;
}

export interface QuotaFactice extends QuotaStore {
  readonly reservations: string[];
  readonly cooldowns: { groupe: string; fin: Date }[];
  readonly incrementsAuth: string[];
  annulerSurAttente: boolean;
}

/**
 * `QuotaStore` factice fidèle au contrat du port (07 §4) : admission immédiate par défaut,
 * mais applique la règle « Retry-After > deadline ⇒ deadline insuffisante » via le vrai code
 * d'erreur du module quota (réutilisé, pas réinventé), et peut simuler une attente annulée.
 */
export function creerQuotaFactice(clock: Clock): QuotaFactice {
  const groupes = new Map<string, EtatGroupeFactice>();
  const reservations: string[] = [];
  const cooldowns: { groupe: string; fin: Date }[] = [];
  const incrementsAuth: string[] = [];
  const quota: QuotaFactice = {
    reservations,
    cooldowns,
    incrementsAuth,
    annulerSurAttente: false,
    async reserveDepart(groupe: string, deadline: Date, signal?: AbortSignal): Promise<void> {
      if (quota.annulerSurAttente) {
        await clock.wait(60_000, signal);
        throw erreurQuotaAnnule(groupe);
      }
      const etat = groupes.get(groupe);
      if (etat?.cooldownFin !== null && etat?.cooldownFin !== undefined) {
        if (etat.cooldownFin.getTime() > deadline.getTime()) {
          throw erreurDeadlineInsuffisante(groupe);
        }
      }
      reservations.push(groupe);
    },
    async getStatut(): Promise<StatutQuota> {
      return { quotaJourRestant: 10_000, quotaUtilisable: 9_500, quotaEstime: true };
    },
    async enregistrerCooldown429(groupe: string, finCooldown: Date): Promise<void> {
      groupes.set(groupe, { cooldownFin: finCooldown });
      cooldowns.push({ groupe, fin: finCooldown });
    },
    async incrementerAuth(groupe: string): Promise<void> {
      incrementsAuth.push(groupe);
    },
    async getCompteurAuth(): Promise<number> {
      return incrementsAuth.length;
    },
  };
  return quota;
}

export interface HookTokenFactice extends HookToken {
  readonly appelsObtenir: number[];
  readonly appelsInvalider: number[];
  simulerRefreshConcurrent(): void;
}

/**
 * `HookToken` factice en mémoire (pas de store réel) : `invaliderToken(g)` ne déclenche un
 * rafraîchissement au prochain `obtenirToken` que si `g` correspond toujours à la génération
 * courante (décision 12) — sinon c'est un no-op, fidèle au contrat de `invaliderAccessToken`.
 */
export function creerHookTokenFactice(initial: { accessToken: string; generation: number }): HookTokenFactice {
  let etat = { ...initial };
  let doitRafraichir = false;
  const appelsObtenir: number[] = [];
  const appelsInvalider: number[] = [];
  const hook: HookTokenFactice = {
    appelsObtenir,
    appelsInvalider,
    async obtenirToken(_parametres: ParametresCycle): Promise<ResultatToken> {
      appelsObtenir.push(etat.generation);
      if (doitRafraichir) {
        doitRafraichir = false;
        etat = { accessToken: `${etat.accessToken}-r${etat.generation + 1}`, generation: etat.generation + 1 };
        return { accessToken: etat.accessToken, tentativesAuth: 1, generation: etat.generation };
      }
      return { accessToken: etat.accessToken, tentativesAuth: 0, generation: etat.generation };
    },
    async invaliderToken(generation: number): Promise<void> {
      appelsInvalider.push(generation);
      if (generation === etat.generation) {
        doitRafraichir = true;
      }
    },
    simulerRefreshConcurrent(): void {
      etat = { accessToken: `${etat.accessToken}-concurrent`, generation: etat.generation + 1 };
    },
  };
  return hook;
}

/** Hook token qui ne doit jamais être appelé (tests de refus avant tout accès réseau/auth). */
export function creerHookTokenInterdit(): HookToken {
  return {
    obtenirToken(): Promise<ResultatToken> {
      throw new Error("Hook token appelé alors qu'il ne devait pas l'être.");
    },
    invaliderToken(): Promise<void> {
      throw new Error("invaliderToken appelé alors qu'il ne devait pas l'être.");
    },
  };
}

export interface ServeurHttpTest {
  readonly port: number;
  readonly requetes: { method: string; url: string; headers: Record<string, string | string[] | undefined> }[];
  fermer(): Promise<void>;
}

/** Petit serveur HTTP local (07 §4, tests sans appel réseau réel vers EBP). */
export async function demarrerServeurTest(
  gestionnaire: (requete: { method: string; url: string }, repondre: (status: number, headers: Record<string, string>, corps: string) => void) => void,
): Promise<ServeurHttpTest> {
  const requetes: ServeurHttpTest["requetes"] = [];
  const serveur: Server = createServer((req, res) => {
    requetes.push({ method: req.method ?? "GET", url: req.url ?? "/", headers: req.headers });
    gestionnaire({ method: req.method ?? "GET", url: req.url ?? "/" }, (status, headers, corps) => {
      res.writeHead(status, headers);
      res.end(corps);
    });
  });
  const port = await new Promise<number>((resolve, reject) => {
    serveur.once("error", reject);
    serveur.listen(0, "127.0.0.1", () => {
      const adresse = serveur.address();
      resolve(typeof adresse === "object" && adresse !== null ? adresse.port : 0);
    });
  });
  return {
    port,
    requetes,
    fermer: () =>
      new Promise<void>((resolve) => {
        serveur.close(() => resolve());
      }),
  };
}
