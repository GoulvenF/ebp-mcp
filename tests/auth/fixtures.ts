import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  creerGestionnaireVerrous,
  creerOperationsFichierNode,
  creerStoreJson,
  creerTokenStoreFichier,
  nomVerrouIdentite,
} from "../../dist/index.js";
import type {
  Clock,
  HttpRequestSpec,
  HttpResponseSpec,
  HttpTransport,
  IdentiteStockage,
  LockManager,
  StoreJson,
  TokenStore,
} from "../../dist/index.js";

/**
 * Horloge entièrement contrôlée par le test : `avancer()`/`definir()` déplacent `now()` et
 * résolvent toute attente dont le délai est écoulé. Nécessaire pour prouver les décisions
 * temporelles (marge d'expiration, abandon de refresh) sans attendre de vrais délais.
 */
export interface HorlogeControlee extends Clock {
  avancer(ms: number): void;
  definir(date: Date): void;
}

interface AttenteEnCours {
  readonly echeance: number;
  readonly resolve: () => void;
  readonly nettoyer: () => void;
}

export function creerHorlogeControlee(depart: Date): HorlogeControlee {
  let maintenant = depart;
  const attentes: AttenteEnCours[] = [];

  function reveillerEchues(): void {
    for (let i = attentes.length - 1; i >= 0; i -= 1) {
      const attente = attentes[i]!;
      if (attente.echeance <= maintenant.getTime()) {
        attentes.splice(i, 1);
        attente.nettoyer();
        attente.resolve();
      }
    }
  }

  return {
    now(): Date {
      return maintenant;
    },
    avancer(ms: number): void {
      maintenant = new Date(maintenant.getTime() + ms);
      reveillerEchues();
    },
    definir(date: Date): void {
      maintenant = date;
      reveillerEchues();
    },
    wait(durationMs: number, signal?: AbortSignal): Promise<void> {
      return new Promise((resolve) => {
        if (signal?.aborted === true || durationMs <= 0) {
          resolve();
          return;
        }
        const entree: AttenteEnCours = {
          echeance: maintenant.getTime() + durationMs,
          resolve,
          nettoyer: () => {
            if (signal !== undefined) signal.removeEventListener("abort", onAbort);
          },
        };
        function onAbort(): void {
          const index = attentes.indexOf(entree);
          if (index !== -1) attentes.splice(index, 1);
          resolve();
        }
        if (signal !== undefined) signal.addEventListener("abort", onAbort, { once: true });
        attentes.push(entree);
      });
    },
  };
}

/** Requête capturée par le transport factice, pour assertions sur le corps/en-têtes envoyés. */
export interface RequeteCapturee {
  readonly method: string;
  readonly url: string;
  readonly headers: Record<string, string>;
  readonly champsCorps: Record<string, string>;
}

export type ReponseProgrammee =
  | { readonly status: number; readonly corps: unknown }
  | { readonly erreurReseau: true };

/**
 * Transport factice (identité EBP) : consomme une réponse programmée par appel, dans l'ordre,
 * et capture chaque requête. Une liste trop courte lève explicitement (le test doit programmer
 * exactement le nombre d'échanges attendus — zéro appel « gratuit »).
 */
export function creerTransportFactice(reponses: ReponseProgrammee[]): HttpTransport & { appels: RequeteCapturee[] } {
  const appels: RequeteCapturee[] = [];
  const file = [...reponses];

  return {
    appels,
    async request(spec: HttpRequestSpec): Promise<HttpResponseSpec> {
      const champsCorps: Record<string, string> = {};
      if (spec.body !== undefined) {
        for (const [cle, valeur] of new URLSearchParams(spec.body)) {
          champsCorps[cle] = valeur;
        }
      }
      appels.push({ method: spec.method, url: spec.url, headers: spec.headers ?? {}, champsCorps });

      const programmee = file.shift();
      if (programmee === undefined) {
        throw new Error("Transport factice : aucune réponse programmée pour cet appel (second échange inattendu).");
      }
      if ("erreurReseau" in programmee) {
        throw new Error("Échec réseau simulé.");
      }
      return {
        status: programmee.status,
        headers: {},
        body: JSON.stringify(programmee.corps),
      };
    },
  };
}

export function reponseTokenValide(overrides?: Record<string, unknown>): ReponseProgrammee {
  return {
    status: 200,
    corps: {
      access_token: "access-token-1",
      refresh_token: "refresh-token-1",
      expires_in: 3600,
      token_type: "Bearer",
      ...overrides,
    },
  };
}

export async function creerRepertoireTemporaire(): Promise<string> {
  return mkdtemp(join(tmpdir(), "ebp-mcp-auth-"));
}

export async function nettoyerRepertoire(chemin: string): Promise<void> {
  await rm(chemin, { recursive: true, force: true });
}

export function identiteTest(): IdentiteStockage {
  return { profil: "default", environnement: "prod", empreinteClientId: "empreinte-test" };
}

export interface DependancesStockageTest {
  readonly verrous: LockManager;
  readonly store: StoreJson;
  readonly tokenStore: TokenStore;
  readonly identite: IdentiteStockage;
  readonly nomVerrou: string;
  readonly cheminGenerations: string;
}

/**
 * Dépendances de stockage réelles (verrou fichier + `StoreJson` + `TokenStore` fichier), seule
 * l'horloge et le transport HTTP sont injectés par le test (décision 10, interdiction de deviner
 * le comportement de T04). Un répertoire temporaire par test évite toute interférence.
 */
export function construireDependancesStockage(dir: string, clock: Clock): DependancesStockageTest {
  const identite = identiteTest();
  const operations = creerOperationsFichierNode();
  const verrous = creerGestionnaireVerrous({ repertoire: dir, operations, clock });
  const store = creerStoreJson({ operations });
  const cheminGenerations = join(dir, "generations.json");
  const cheminTokens = join(dir, "tokens.json");
  const tokenStore = creerTokenStoreFichier({ chemin: cheminTokens, store, operations });
  const nomVerrou = nomVerrouIdentite(`${identite.profil}.${identite.environnement}.${identite.empreinteClientId}`);
  return { verrous, store, tokenStore, identite, nomVerrou, cheminGenerations };
}

/**
 * Ouvreur de navigateur factice : capture l'URL d'autorisation construite par `login()` (pour
 * en extraire `state`/PKCE) et résout immédiatement — `login()` attend l'ouverture avant de
 * démarrer le serveur de callback, le vrai callback doit donc être envoyé séparément par le test
 * une fois `attendreCallback` certainement en écoute.
 */
export function creerOuvrirNavigateurCapture(): {
  ouvrir: (url: string) => Promise<void>;
  urlOuverte: () => URL | undefined;
} {
  let capturee: URL | undefined;
  return {
    async ouvrir(url: string): Promise<void> {
      capturee = new URL(url);
    },
    urlOuverte: () => capturee,
  };
}

/** Petite attente réelle de synchronisation (pas de logique métier), pour laisser un serveur réel démarrer. */
export async function laisserBoucleEvenements(ms = 20): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Enveloppe `base` pour exécuter `hook` avant le `numeroAppel`-ième `acquire(nomCible, …)`
 * (1-indexé), puis déléguer réellement à `base`. Sert à injecter un événement concurrent
 * (ex. logout) exactement dans la fenêtre entre deux détentions successives du même verrou,
 * sans dépendre d'un timing réel fragile.
 */
export function verrousAvecHookAvantAcquisition(
  base: LockManager,
  nomCible: string,
  numeroAppel: number,
  hook: () => Promise<void>,
): LockManager {
  let compte = 0;
  return {
    async acquire(nom, deadline, signal) {
      if (nom === nomCible) {
        compte += 1;
        if (compte === numeroAppel) {
          await hook();
        }
      }
      return base.acquire(nom, deadline, signal);
    },
  };
}

/** Obtient un port TCP libre sur 127.0.0.1 en bindant puis fermant immédiatement (interdiction de port fixe). */
export async function portLibre(): Promise<number> {
  return new Promise((resolve, reject) => {
    const serveur = createServer();
    serveur.once("error", reject);
    serveur.listen(0, "127.0.0.1", () => {
      const adresse = serveur.address();
      const port = typeof adresse === "object" && adresse !== null ? adresse.port : 0;
      serveur.close(() => resolve(port));
    });
  });
}
