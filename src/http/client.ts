import type { Famille, Environnement } from "../domain/capabilities.js";
import type { Secret } from "../config/secret.js";
import type { Clock } from "../ports/clock.js";
import type { HttpTransport } from "../ports/http-transport.js";
import type { QuotaStore } from "../ports/quota-store.js";
import type { HookToken } from "./auth-hook.js";
import type { Budget } from "./budget.js";
import {
  erreurAnnuleHttp,
  erreurArgumentInvalideEbp,
  erreurAuthRequiseHttp,
  erreurBudgetEpuiseHttp,
  erreurDeadlineDepasseeHttp,
  ErreurHttp,
  erreurHoteNonAutorise,
  erreurMethodeRefusee,
  erreurNonTrouveHttp,
  erreurPermissionRefuseeHttp,
  erreurReponseTropVolumineuse,
  erreurRouteInconnue,
  erreurSchemaInattendu,
  erreurUpstreamIndisponible,
} from "./errors.js";
import { construireEntetes } from "./entetes.js";
import type { EntreeJournalHttp, JournalHttp } from "./journal-http.js";
import { creerJournalHttpStderr, idRequeteCourt } from "./journal-http.js";
import { origineMetier } from "./origines.js";
import type { EntreeRegistre } from "./registre.js";
import { trouverRoute } from "./registre.js";
import { PLAFOND_TAILLE_OCTETS } from "./transport-fetch.js";
import { construireChemin, construireQuery, type ValeurParametre } from "./url.js";

/** Timeout d'une requête métier (décision 8, 07 §4), bornée par le temps restant. */
export const TIMEOUT_REQUETE_METIER_MS = 15_000;

/** Backoff fixe (décision 11, 07 §4) : 1 s après le 1er échec, 2 s après le 2e. */
const BACKOFF_MS = [1000, 2000] as const;

const STATUTS_RETRY = new Set([429, 502, 503, 504]);

export interface DependancesClientHttp {
  readonly transport: HttpTransport;
  readonly clock: Clock;
  readonly quota: QuotaStore;
  readonly hookToken: HookToken;
  readonly journal?: JournalHttp;
}

export interface ContexteHttp {
  readonly environnement: Environnement;
  readonly famille: Famille;
  readonly dossierId: string;
  readonly subscriptionKey: Secret | null;
  readonly groupeQuota: string;
}

export interface ParametresExecution {
  readonly segments?: Readonly<Record<string, string>>;
  readonly parametres?: Readonly<Record<string, ValeurParametre>>;
}

function estAnnule(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

function journaliser(journal: JournalHttp, base: Omit<EntreeJournalHttp, "raisonArret">, raisonArret?: string): void {
  journal.tentative(raisonArret !== undefined ? { ...base, raisonArret } : base);
}

/**
 * Valide méthode et hôte **avant** toute construction de chemin/query (décision 2/3, 07 §4).
 * L'origine réelle n'est jamais lue sur la route (qui ne porte qu'un libellé `hote: "metier"`) :
 * elle est toujours dérivée de l'environnement du contexte, jamais d'un argument.
 */
function validerRoute(route: EntreeRegistre): void {
  if (route.methode !== "GET") {
    throw erreurMethodeRefusee(route.id, route.methode);
  }
  if (route.hote !== "metier") {
    throw erreurHoteNonAutorise(route.id, String(route.hote));
  }
}

function construireUrl(route: EntreeRegistre, environnement: Environnement, parametres: ParametresExecution): string {
  const chemin = construireChemin(route, parametres.segments ?? {});
  const query = construireQuery(route, parametres.parametres);
  const base = `${origineMetier(environnement)}${route.prefixe}${chemin}`;
  const suffixe = query.size > 0 ? `?${query.toString()}` : "";
  return `${base}${suffixe}`;
}

function parseRetryAfter(valeur: string | undefined, maintenant: Date): Date | null {
  if (valeur === undefined) return null;
  if (/^\d+$/.test(valeur)) {
    return new Date(maintenant.getTime() + Number.parseInt(valeur, 10) * 1000);
  }
  const date = new Date(valeur);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function requeteAvecTimeout(
  transport: HttpTransport,
  clock: Clock,
  url: string,
  headers: Record<string, string>,
  timeoutMs: number,
  signalExterne: AbortSignal | undefined,
): Promise<{ status: number; headers: Record<string, string>; body: string }> {
  const combineur = new AbortController();
  const onAbortExterne = (): void => combineur.abort();
  signalExterne?.addEventListener("abort", onAbortExterne, { once: true });

  const minuteur = new AbortController();
  const attenteMinuteur = clock.wait(timeoutMs, minuteur.signal).then(() => {
    if (!minuteur.signal.aborted) combineur.abort();
  });

  try {
    return await transport.request({ method: "GET", url, headers, signal: combineur.signal });
  } finally {
    minuteur.abort();
    signalExterne?.removeEventListener("abort", onAbortExterne);
    await attenteMinuteur.catch(() => undefined);
  }
}

async function attendreBackoff(clock: Clock, tentative: number, signal: AbortSignal | undefined): Promise<void> {
  const delai = BACKOFF_MS[Math.min(tentative - 1, BACKOFF_MS.length - 1)] as number;
  await clock.wait(delai, signal);
}

function analyserCorps(routeId: string, statut: number, headers: Record<string, string>, body: string): unknown {
  const tailleOctets = Buffer.byteLength(body, "utf8");
  if (tailleOctets > PLAFOND_TAILLE_OCTETS) {
    throw erreurReponseTropVolumineuse(routeId);
  }
  const contentType = headers["content-type"] ?? headers["Content-Type"];
  if (contentType !== undefined && !contentType.toLowerCase().includes("application/json")) {
    throw erreurSchemaInattendu(routeId, statut);
  }
  try {
    return JSON.parse(body);
  } catch {
    throw erreurSchemaInattendu(routeId, statut);
  }
}

/**
 * Exécute une requête métier GET à travers le client contrôlé (07 §4) : seul point du code
 * autorisé à émettre une requête réseau. Ordre par tentative : validation (une fois) → préparation
 * token → admission quota → revalidation token → émission → plafond de taille → `JSON.parse`
 * (décision 8). Budget/deadline/signal sont revérifiés en tête de chaque tentative ; un budget ou
 * une deadline déjà épuisés à cet instant arrêtent l'appel avant toute préparation de token ou
 * émission supplémentaire (décision 9/17).
 */
export async function executerRequete(
  deps: DependancesClientHttp,
  budget: Budget,
  contexte: ContexteHttp,
  route: EntreeRegistre,
  parametres: ParametresExecution = {},
): Promise<unknown> {
  const journal = deps.journal ?? creerJournalHttpStderr();
  validerRoute(route);
  const url = construireUrl(route, contexte.environnement, parametres);
  const requeteId = idRequeteCourt();
  const base = (statut: number | null, tentative: number): Omit<EntreeJournalHttp, "raisonArret"> => ({
    requeteId,
    routeId: route.id,
    famille: contexte.famille,
    methode: "GET",
    statut,
    dureeMs: 0,
    tentative,
  });

  let accessTokenActuel = "";
  let generationActuelle: number | null = null;
  let nombre401 = 0;

  async function prepareToken(): Promise<void> {
    const resultat = await deps.hookToken.obtenirToken({
      budgetRestant: budget.restant,
      deadline: budget.deadline,
      ...(budget.signal !== undefined ? { signal: budget.signal } : {}),
    });
    budget.consommer(resultat.tentativesAuth);
    if (resultat.tentativesAuth > 0) {
      await deps.quota.incrementerAuth(contexte.groupeQuota, budget.signal);
    }
    accessTokenActuel = resultat.accessToken;
    generationActuelle = resultat.generation;
  }

  for (let tentative = 1; tentative <= 3; tentative += 1) {
    if (estAnnule(budget.signal)) {
      throw erreurAnnuleHttp(route.id);
    }
    if (deps.clock.now().getTime() >= budget.deadline.getTime()) {
      throw erreurDeadlineDepasseeHttp(route.id);
    }
    if (budget.restant < 1) {
      throw erreurBudgetEpuiseHttp(route.id);
    }

    await prepareToken();
    await deps.quota.reserveDepart(contexte.groupeQuota, budget.deadline, budget.signal);
    // Revalidation après l'admission (décision 8) : `obtenirToken` ne rafraîchit que si le token
    // est réellement proche de l'expiration, sinon c'est un no-op réseau (0 tentative consommée).
    await prepareToken();

    // Revérifié ici (et pas seulement en tête de tentative) : l'attente d'admission peut avoir
    // franchi la deadline, et la préparation du token ci-dessus peut avoir consommé le reste du
    // budget partagé (décision 8/9) ; arrêt avant toute émission.
    if (estAnnule(budget.signal)) {
      throw erreurAnnuleHttp(route.id);
    }
    if (deps.clock.now().getTime() >= budget.deadline.getTime()) {
      throw erreurDeadlineDepasseeHttp(route.id);
    }
    if (budget.restant < 1) {
      throw erreurBudgetEpuiseHttp(route.id);
    }

    const debut = deps.clock.now().getTime();
    const restantAvantEmission = budget.deadline.getTime() - deps.clock.now().getTime();
    const timeoutMs = Math.max(0, Math.min(TIMEOUT_REQUETE_METIER_MS, restantAvantEmission));
    budget.consommer(1);

    const entetes = construireEntetes({
      accessToken: accessTokenActuel,
      subscriptionKey: contexte.subscriptionKey,
      famille: contexte.famille,
      dossierId: contexte.dossierId,
    });

    let reponse: { status: number; headers: Record<string, string>; body: string };
    try {
      reponse = await requeteAvecTimeout(deps.transport, deps.clock, url, entetes, timeoutMs, budget.signal);
    } catch (erreurTransport) {
      if (erreurTransport instanceof ErreurHttp) throw erreurTransport;
      const dureeMs = deps.clock.now().getTime() - debut;
      if (estAnnule(budget.signal)) {
        journaliser(journal, { ...base(null, tentative), dureeMs }, "annule");
        throw erreurAnnuleHttp(route.id);
      }
      if (tentative >= 3) {
        journaliser(journal, { ...base(null, tentative), dureeMs }, "upstream");
        throw erreurUpstreamIndisponible(route.id, null);
      }
      journaliser(journal, { ...base(null, tentative), dureeMs });
      await attendreBackoff(deps.clock, tentative, budget.signal);
      continue;
    }

    const dureeMs = deps.clock.now().getTime() - debut;
    const statut = reponse.status;
    const ligne = { ...base(statut, tentative), dureeMs };

    if (statut === 200) {
      journaliser(journal, ligne);
      return analyserCorps(route.id, statut, reponse.headers, reponse.body);
    }
    if (statut === 400) {
      journaliser(journal, ligne, "invalide");
      throw erreurArgumentInvalideEbp(route.id, statut);
    }
    if (statut === 403) {
      journaliser(journal, ligne, "permission");
      throw erreurPermissionRefuseeHttp(route.id, statut);
    }
    if (statut === 404) {
      journaliser(journal, ligne, "introuvable");
      throw erreurNonTrouveHttp(route.id, statut);
    }
    if (statut === 401) {
      if (nombre401 >= 1 || tentative >= 3) {
        journaliser(journal, ligne, "auth");
        throw erreurAuthRequiseHttp(route.id, statut);
      }
      journaliser(journal, ligne, "auth-rejeu");
      nombre401 += 1;
      if (generationActuelle !== null) {
        await deps.hookToken.invaliderToken(generationActuelle);
      }
      continue;
    }
    if (statut === 0 || (statut >= 300 && statut < 400)) {
      journaliser(journal, ligne, "redirection");
      throw erreurUpstreamIndisponible(route.id, statut);
    }
    if (STATUTS_RETRY.has(statut)) {
      if (tentative >= 3) {
        journaliser(journal, ligne, "upstream");
        throw erreurUpstreamIndisponible(route.id, statut);
      }
      if (statut === 429) {
        const finCooldown = parseRetryAfter(reponse.headers["retry-after"], deps.clock.now());
        if (finCooldown !== null) {
          journaliser(journal, ligne, "cooldown-429");
          await deps.quota.enregistrerCooldown429(contexte.groupeQuota, finCooldown, budget.signal);
          continue;
        }
      }
      journaliser(journal, ligne, "backoff");
      await attendreBackoff(deps.clock, tentative, budget.signal);
      continue;
    }

    journaliser(journal, ligne, "upstream");
    throw erreurUpstreamIndisponible(route.id, statut);
  }

  throw erreurUpstreamIndisponible(route.id, null);
}

/** Variante par identifiant de route (usage adapters T08+) : lève `INVALID_ARGUMENT` si inconnue. */
export async function executerRequetePourRoute(
  deps: DependancesClientHttp,
  budget: Budget,
  contexte: ContexteHttp,
  routeId: string,
  parametres?: ParametresExecution,
): Promise<unknown> {
  const route = trouverRoute(routeId);
  if (route === undefined) {
    throw erreurRouteInconnue(routeId);
  }
  return executerRequete(deps, budget, contexte, route, parametres);
}
