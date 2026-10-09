import type { GroupeQuota } from "../config/resolution.js";
import type { Identifiant } from "../config/identifiers.js";
import type { Clock } from "../ports/clock.js";
import type { LockManager } from "../ports/lock-manager.js";
import type { QuotaStore, StatutQuota } from "../ports/quota-store.js";
import type { JournalStockage, StoreJson } from "../storage/store-json.js";
import { mettreAJourSousVerrou } from "../storage/transaction.js";
import { cheminEtatQuota, nomVerrouQuota, validerGroupe } from "./chemins.js";
import type { EtatQuotaPersistant } from "./etat.js";
import { TYPE_QUOTA, appliquerRollover } from "./etat.js";
import { erreurDeadlineInsuffisante, erreurGroupeInconnu, erreurQuotaAnnule, erreurReserveAtteinte } from "./errors.js";

/**
 * Bornage interne de l'attente du **verrou** pour les mutations qui n'ont pas de deadline fournie
 * par l'appelant (`enregistrerCooldown429`, `incrementerAuth`) : un détail d'implémentation du
 * stockage, pas une formule ou une limite contractuelle de 07 §4.
 */
const DEADLINE_VERROU_INTERNE_MS = 15000;

export interface DependancesQuotaStoreFichier {
  /** Racine de configuration (07 §2) : l'état vit sous `<racine>/quota/<groupe>.json`. */
  readonly racine: string;
  readonly groupesQuota: ReadonlyMap<Identifiant, GroupeQuota>;
  readonly verrous: LockManager;
  readonly store: StoreJson;
  readonly clock: Clock;
  readonly journal?: JournalStockage;
}

/** `signal.aborted` relu à chaque appel (peut changer pendant un `await`, 07 §4). */
function estAnnule(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

/**
 * Sentinelle interne (jamais exposée par le module) : signale depuis le transformateur de
 * {@link mettreAJourSousVerrou} qu'aucune mutation n'a eu lieu et qu'il faut attendre `attenteMs`
 * **hors verrou** avant de relire l'état (07 §4, boucle de `reserveDepart`).
 */
class AttenteNecessaire extends Error {
  readonly attenteMs: number;

  constructor(attenteMs: number) {
    super("Attente nécessaire avant le prochain départ.");
    this.attenteMs = attenteMs;
  }
}

function configPourGroupe(
  groupesQuota: ReadonlyMap<Identifiant, GroupeQuota>,
  groupe: Identifiant,
): GroupeQuota {
  const config = groupesQuota.get(groupe);
  if (config === undefined) {
    throw erreurGroupeInconnu(groupe);
  }
  return config;
}

/**
 * Décide de l'issue d'un `reserveDepart` sous verrou (07 §4) : calcule l'attente d'espacement et
 * de cooldown à partir de l'état relu (après rollover en mémoire), puis soit admet (incrémente et
 * date le départ, l'état retourné sera écrit par {@link mettreAJourSousVerrou}), soit refuse par
 * une erreur typée (réserve atteinte ou deadline insuffisante, sans mutation), soit lève
 * {@link AttenteNecessaire} (sans mutation, l'appelant attend hors verrou puis relit).
 */
function decider(
  actuelle: EtatQuotaPersistant | null,
  maintenant: Date,
  deadline: Date,
  config: GroupeQuota,
  groupe: Identifiant,
): EtatQuotaPersistant {
  const etat = appliquerRollover(actuelle, maintenant, config);
  const dernierDepart = etat.dernierDepart !== null ? new Date(etat.dernierDepart) : null;
  const finCooldown = etat.finCooldown429 !== null ? new Date(etat.finCooldown429) : null;

  // Écart signé (jamais `Math.abs`) : une horloge reculée ne doit jamais avancer un départ.
  const attenteEspacement =
    dernierDepart !== null ? dernierDepart.getTime() + config.minIntervalMs - maintenant.getTime() : 0;
  const attenteCooldown = finCooldown !== null ? finCooldown.getTime() - maintenant.getTime() : 0;
  const attenteMs = Math.max(0, attenteEspacement, attenteCooldown);

  if (attenteMs === 0) {
    if (etat.consomme >= config.maxPerDay - config.reserve) {
      throw erreurReserveAtteinte(groupe);
    }
    return { ...etat, consomme: etat.consomme + 1, dernierDepart: maintenant.toISOString() };
  }

  if (maintenant.getTime() + attenteMs > deadline.getTime()) {
    throw erreurDeadlineInsuffisante(groupe);
  }
  throw new AttenteNecessaire(attenteMs);
}

/**
 * `QuotaStore` adossé au store atomique et au gestionnaire de verrous de T04 (07 §4) : une seule
 * politique d'admission par groupe, partagée par tous les profils/processus qui déclarent ce
 * groupe. Aucun appel réseau, aucune dépendance à l'auth — l'ordre « préparation token →
 * admission quota/budget → transport » (07 §4) reste à la charge de T07.
 */
export function creerQuotaStoreFichier(deps: DependancesQuotaStoreFichier): QuotaStore {
  const { racine, groupesQuota, verrous, store, clock, journal } = deps;

  function parametresTransaction(groupeValide: Identifiant, deadline: Date, signal: AbortSignal | undefined) {
    return {
      verrous,
      store,
      nomVerrou: nomVerrouQuota(groupeValide),
      chemin: cheminEtatQuota(racine, groupeValide),
      type: TYPE_QUOTA,
      deadline,
      ...(signal !== undefined ? { signal } : {}),
      ...(journal !== undefined ? { journal } : {}),
    };
  }

  return {
    async reserveDepart(groupe: string, deadline: Date, signal?: AbortSignal): Promise<void> {
      const groupeValide = validerGroupe(groupe);
      const config = configPourGroupe(groupesQuota, groupeValide);

      while (true) {
        if (estAnnule(signal)) {
          throw erreurQuotaAnnule(groupeValide);
        }
        if (clock.now().getTime() >= deadline.getTime()) {
          throw erreurDeadlineInsuffisante(groupeValide);
        }

        try {
          await mettreAJourSousVerrou<EtatQuotaPersistant>(
            parametresTransaction(groupeValide, deadline, signal),
            (actuelle) => decider(actuelle, clock.now(), deadline, config, groupeValide),
          );
          return;
        } catch (erreur) {
          if (!(erreur instanceof AttenteNecessaire)) {
            throw erreur;
          }
          await clock.wait(erreur.attenteMs, signal);
          if (estAnnule(signal)) {
            throw erreurQuotaAnnule(groupeValide);
          }
        }
      }
    },

    async getStatut(groupe: string): Promise<StatutQuota> {
      const groupeValide = validerGroupe(groupe);
      const config = configPourGroupe(groupesQuota, groupeValide);
      const actuelle = await store.lire<EtatQuotaPersistant>(cheminEtatQuota(racine, groupeValide), TYPE_QUOTA);
      const etat = appliquerRollover(actuelle, clock.now(), config);

      const quotaJourRestant = Math.max(0, config.maxPerDay - etat.consomme);
      const quotaUtilisable = Math.max(0, quotaJourRestant - config.reserve);
      return { quotaJourRestant, quotaUtilisable, quotaEstime: true };
    },

    async enregistrerCooldown429(groupe: string, finCooldown: Date, signal?: AbortSignal): Promise<void> {
      const groupeValide = validerGroupe(groupe);
      const config = configPourGroupe(groupesQuota, groupeValide);
      const deadline = new Date(clock.now().getTime() + DEADLINE_VERROU_INTERNE_MS);

      await mettreAJourSousVerrou<EtatQuotaPersistant>(
        parametresTransaction(groupeValide, deadline, signal),
        (actuelle) => {
          const etat = appliquerRollover(actuelle, clock.now(), config);
          const finActuelle = etat.finCooldown429 !== null ? new Date(etat.finCooldown429) : null;
          const finRetenue =
            finActuelle === null || finCooldown.getTime() > finActuelle.getTime() ? finCooldown : finActuelle;
          return { ...etat, finCooldown429: finRetenue.toISOString() };
        },
      );
    },

    async incrementerAuth(groupe: string, signal?: AbortSignal): Promise<void> {
      const groupeValide = validerGroupe(groupe);
      const config = configPourGroupe(groupesQuota, groupeValide);
      const deadline = new Date(clock.now().getTime() + DEADLINE_VERROU_INTERNE_MS);

      await mettreAJourSousVerrou<EtatQuotaPersistant>(
        parametresTransaction(groupeValide, deadline, signal),
        (actuelle) => {
          const etat = appliquerRollover(actuelle, clock.now(), config);
          return { ...etat, consommeAuth: etat.consommeAuth + 1 };
        },
      );
    },

    async getCompteurAuth(groupe: string): Promise<number> {
      const groupeValide = validerGroupe(groupe);
      const config = configPourGroupe(groupesQuota, groupeValide);
      const actuelle = await store.lire<EtatQuotaPersistant>(cheminEtatQuota(racine, groupeValide), TYPE_QUOTA);
      const etat = appliquerRollover(actuelle, clock.now(), config);
      return etat.consommeAuth;
    },
  };
}
