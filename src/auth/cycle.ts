import type { Clock } from "../ports/clock.js";
import type { HttpTransport } from "../ports/http-transport.js";
import type { LockManager } from "../ports/lock-manager.js";
import type { EnregistrementToken, IdentiteStockage, TokenStore } from "../ports/token-store.js";
import type { Secret } from "../config/secret.js";
import type { StoreJson, JournalStockage } from "../storage/store-json.js";
import { echangerToken, REFRESH_ESTIME_MS } from "./client-token.js";
import { erreurAuthRequise } from "./errors.js";
import {
  apresReservation,
  commitAutorise,
  ecrireGenerations,
  lireGenerations,
  sousVerrouIdentite,
} from "./store-generations.js";

/**
 * 15 s de timeout de requête token + 5 s de marge (décision 4.6, 07 §3) : au-delà, un marqueur
 * `refreshing` est considéré indéterminé (processus mort ou bloqué) et n'est jamais rejoué.
 */
export const DELAI_ABANDON_REFRESH_MS = 20_000;

/** Avant chaque appel métier : refresh si `expiresAt - 60s < now` (03, 07 §3). */
export const MARGE_EXPIRATION_MS = 60_000;

/** Pas d'attente entre deux relectures de l'observateur d'un refresh concurrent. */
const PAS_ATTENTE_OBSERVATEUR_MS = 100;

export interface ProfilAuth {
  readonly clientId: string;
  readonly clientSecret?: Secret;
}

export interface DependancesCycle {
  readonly transport: HttpTransport;
  readonly clock: Clock;
  readonly verrous: LockManager;
  readonly store: StoreJson;
  readonly tokenStore: TokenStore;
  readonly identite: IdentiteStockage;
  readonly nomVerrou: string;
  readonly cheminGenerations: string;
  readonly profilAuth: ProfilAuth;
  readonly journal?: JournalStockage;
}

export interface ParametresCycle {
  readonly budgetRestant: number;
  readonly deadline: Date;
  readonly signal?: AbortSignal;
}

export interface ResultatCycle {
  readonly accessToken: string;
  readonly tentativesAuth: number;
}

export function estFrais(enregistrement: EnregistrementToken, maintenant: Date): boolean {
  return new Date(enregistrement.expiresAt).getTime() - MARGE_EXPIRATION_MS >= maintenant.getTime();
}

type DecisionSousVerrou =
  | { readonly type: "absent" }
  | { readonly type: "reauth" }
  | { readonly type: "frais"; readonly enregistrement: EnregistrementToken }
  | { readonly type: "attendre" }
  | { readonly type: "abandonne" }
  | { readonly type: "devenir_refresher"; readonly refreshToken: string; readonly generation: number };

async function attendreTransitionReady(deps: DependancesCycle, parametres: ParametresCycle): Promise<void> {
  while (true) {
    const maintenant = deps.clock.now();
    if (maintenant.getTime() >= parametres.deadline.getTime()) {
      throw erreurAuthRequise(
        "Délai dépassé en attendant la fin d'un rafraîchissement mené par un autre processus.",
        "Réessayer l'appel.",
      );
    }
    const actuel = await deps.tokenStore.read(deps.identite);
    if (actuel !== null && actuel.state === "ready" && estFrais(actuel, deps.clock.now())) {
      return;
    }
    if (actuel !== null && actuel.state === "reauth_required") {
      throw erreurAuthRequise(
        "Réauthentification requise (rafraîchissement abandonné par un autre processus).",
        "Lancer `ebp-mcp login`.",
      );
    }
    const restant = parametres.deadline.getTime() - deps.clock.now().getTime();
    await deps.clock.wait(Math.min(PAS_ATTENTE_OBSERVATEUR_MS, Math.max(restant, 0)), parametres.signal);
  }
}

/**
 * Marque sous verrou un enregistrement `refreshing`/`G` comme `reauth_required`, seulement s'il
 * n'a pas déjà été remplacé entre-temps (relecture de la génération avant écriture).
 */
async function marquerReauthSiToujoursEnCours(
  deps: DependancesCycle,
  parametres: ParametresCycle,
  generation: number,
): Promise<void> {
  await sousVerrouIdentite(deps.verrous, deps.nomVerrou, parametres.deadline, parametres.signal, deps.journal, async () => {
    const relu = await deps.tokenStore.read(deps.identite);
    if (relu !== null && relu.generation === generation && relu.state === "refreshing") {
      await deps.tokenStore.write(deps.identite, { ...relu, state: "reauth_required" });
    }
  });
}

/**
 * Assure un access token valide (03 §serve, 07 §3, A05) : réutilise un token `ready` encore frais
 * sans appel réseau ; sinon devient l'unique rafraîchisseur sous verrou (marqueur `refreshing`
 * durable avant tout appel réseau, verrou relâché pendant l'échange), ou observe un rafraîchissement
 * concurrent sans jamais émettre un second échange ni rejouer l'ancien refresh token.
 */
export async function assurerTokenValide(
  deps: DependancesCycle,
  parametres: ParametresCycle,
): Promise<ResultatCycle> {
  let tentativesAuth = 0;

  while (true) {
    if (deps.clock.now().getTime() >= parametres.deadline.getTime()) {
      throw erreurAuthRequise("Deadline dépassée avant de rafraîchir le token.", "Réessayer l'appel.");
    }

    const decision: DecisionSousVerrou = await sousVerrouIdentite(
      deps.verrous,
      deps.nomVerrou,
      parametres.deadline,
      parametres.signal,
      deps.journal,
      async (): Promise<DecisionSousVerrou> => {
        const actuel = await deps.tokenStore.read(deps.identite);
        if (actuel === null) {
          return { type: "absent" };
        }
        if (actuel.state === "ready" && estFrais(actuel, deps.clock.now())) {
          return { type: "frais", enregistrement: actuel };
        }
        if (actuel.state === "reauth_required") {
          return { type: "reauth" };
        }
        if (actuel.state === "refreshing") {
          const age = deps.clock.now().getTime() - new Date(actuel.refreshedAt).getTime();
          if (age < DELAI_ABANDON_REFRESH_MS) {
            return { type: "attendre" };
          }
          await deps.tokenStore.write(deps.identite, { ...actuel, state: "reauth_required" });
          return { type: "abandonne" };
        }

        // `ready` mais expiré (ou proche expiration) : devenir l'unique rafraîchisseur.
        const etatGenerations = await lireGenerations({ store: deps.store, chemin: deps.cheminGenerations });
        const nouvelEtatGenerations = apresReservation(etatGenerations);
        await ecrireGenerations({ store: deps.store, chemin: deps.cheminGenerations }, nouvelEtatGenerations);
        const generation = nouvelEtatGenerations.derniereReservee;
        const refreshing: EnregistrementToken = {
          ...actuel,
          state: "refreshing",
          refreshedAt: deps.clock.now().toISOString(),
          generation,
        };
        await deps.tokenStore.write(deps.identite, refreshing);
        return { type: "devenir_refresher", refreshToken: actuel.refreshToken, generation };
      },
    );

    if (decision.type === "frais") {
      return { accessToken: decision.enregistrement.accessToken, tentativesAuth };
    }
    if (decision.type === "absent") {
      throw erreurAuthRequise("Aucun token local pour ce profil.", "Lancer `ebp-mcp login`.");
    }
    if (decision.type === "reauth") {
      throw erreurAuthRequise("Réauthentification requise.", "Lancer `ebp-mcp login`.");
    }
    if (decision.type === "abandonne") {
      throw erreurAuthRequise(
        "Rafraîchissement précédent abandonné (processus interrompu) ; aucun rejeu de l'ancien refresh token.",
        "Lancer `ebp-mcp login`.",
      );
    }
    if (decision.type === "attendre") {
      await attendreTransitionReady(deps, parametres);
      continue;
    }

    // decision.type === "devenir_refresher" : un seul échange réseau, verrou relâché.
    tentativesAuth += 1;
    const resultat = await echangerToken(
      { transport: deps.transport, clock: deps.clock },
      {
        budgetRestant: parametres.budgetRestant,
        deadline: parametres.deadline,
        ...(parametres.signal !== undefined ? { signal: parametres.signal } : {}),
      },
      deps.identite.environnement,
      {
        grant: "refresh_token",
        clientId: deps.profilAuth.clientId,
        ...(deps.profilAuth.clientSecret !== undefined ? { clientSecret: deps.profilAuth.clientSecret } : {}),
        refreshToken: decision.refreshToken,
      },
    );

    if (!resultat.ok) {
      await marquerReauthSiToujoursEnCours(deps, parametres, decision.generation);
      throw erreurAuthRequise(
        resultat.categorie === "invalid_grant"
          ? "Refresh token révoqué par EBP (invalid_grant)."
          : "Échec du rafraîchissement du token (réseau, timeout ou réponse invalide).",
        "Lancer `ebp-mcp login`.",
      );
    }

    if (resultat.refreshToken === null) {
      await marquerReauthSiToujoursEnCours(deps, parametres, decision.generation);
      throw erreurAuthRequise(
        "Réponse de rafraîchissement sans refresh_token.",
        "Lancer `ebp-mcp login`.",
      );
    }

    const maintenant = deps.clock.now();
    const nouvelEnregistrement: EnregistrementToken = {
      accessToken: resultat.accessToken,
      refreshToken: resultat.refreshToken,
      expiresAt: new Date(maintenant.getTime() + resultat.expiresInSecondes * 1000).toISOString(),
      refreshedAt: maintenant.toISOString(),
      refreshExpiresAtEstimate: new Date(maintenant.getTime() + REFRESH_ESTIME_MS).toISOString(),
      generation: decision.generation,
      state: "ready",
    };

    let commis = false;
    await sousVerrouIdentite(deps.verrous, deps.nomVerrou, parametres.deadline, parametres.signal, deps.journal, async () => {
      const etatGenerations = await lireGenerations({ store: deps.store, chemin: deps.cheminGenerations });
      if (!commitAutorise(etatGenerations, decision.generation)) {
        commis = false;
        return;
      }
      await deps.tokenStore.write(deps.identite, nouvelEnregistrement);
      commis = true;
    });

    if (!commis) {
      throw erreurAuthRequise(
        "Rafraîchissement invalidé par une déconnexion concurrente.",
        "Lancer `ebp-mcp login`.",
      );
    }

    return { accessToken: nouvelEnregistrement.accessToken, tentativesAuth };
  }
}
