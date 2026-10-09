import type { Clock } from "../ports/clock.js";
import type { PageSource, PositionSource } from "./source-page.js";

/** TTL référentiel (07 §4/§5). */
export const TTL_REFERENTIEL_MS = 60 * 60 * 1000;
/** TTL transactionnel (07 §4/§5). */
export const TTL_TRANSACTIONNEL_MS = 60 * 1000;
/** Capacité totale, en octets estimés (07 §4/§5) : budget distinct de celui des curseurs. */
export const CAPACITE_CACHE_OCTETS = 32 * 1024 * 1024;

/**
 * Clé de cache (07 §5) : identité/génération + environnement + famille + dossier + `source.id` +
 * filtres/tri/projection normalisés (même normalisation que l'`IdentiteScan`, `empreinteFiltre`)
 * + position de page. Deux dossiers, deux profils ou deux générations ne partagent jamais une
 * entrée.
 */
export interface CleCache {
  readonly identiteGeneration: number;
  readonly environnement: string;
  readonly famille: string;
  readonly dossier: string | null;
  readonly sourceId: string;
  readonly empreinteFiltre: string;
  readonly position: PositionSource;
}

function serialiserCle(cle: CleCache): string {
  return JSON.stringify([
    cle.identiteGeneration,
    cle.environnement,
    cle.famille,
    cle.dossier,
    cle.sourceId,
    cle.empreinteFiltre,
    cle.position,
  ]);
}

interface Entree<E> {
  readonly page: PageSource<E>;
  readonly expiration: Date;
  readonly tailleOctets: number;
  readonly identiteGeneration: number;
}

function estimerTailleOctets(page: PageSource<unknown>): number {
  try {
    return Buffer.byteLength(JSON.stringify(page), "utf8");
  } catch {
    return CAPACITE_CACHE_OCTETS + 1;
  }
}

/**
 * Cache mémoire de pages source (07 §4/§5), à deux classes de TTL (`referentiel` 1 h,
 * `transactionnel` 60 s selon `SourcePaginee.nature`), éviction LRU. Ne met jamais en cache une
 * erreur ni une page invalide (l'appelant n'écrit qu'après validation). Le cache stocke des pages
 * **source**, jamais une sortie finale : la politique PII de T12 s'applique donc toujours, y
 * compris sur une page servie depuis le cache. Une page servie depuis le cache coûte zéro :
 * l'appelant ne consomme ni budget ni quota et n'incrémente pas le compteur d'appels source pour
 * une lecture de cache (cette classe ne fait, elle, aucun appel réseau).
 */
export class CacheSource {
  private readonly entrees = new Map<string, Entree<unknown>>();
  private octetsTotal = 0;
  private readonly clock: Clock;

  constructor(clock: Clock) {
    this.clock = clock;
  }

  lire<E>(cle: CleCache): PageSource<E> | null {
    this.purgerExpires();
    const token = serialiserCle(cle);
    const entree = this.entrees.get(token);
    if (entree === undefined) {
      return null;
    }
    // Touche LRU : réinsertion en fin d'ordre d'itération.
    this.entrees.delete(token);
    this.entrees.set(token, entree);
    return entree.page as PageSource<E>;
  }

  ecrire<E>(cle: CleCache, page: PageSource<E>, nature: "referentiel" | "transactionnel"): void {
    const tailleOctets = estimerTailleOctets(page);
    if (tailleOctets > CAPACITE_CACHE_OCTETS) {
      return;
    }
    this.purgerExpires();
    const token = serialiserCle(cle);
    this.retirer(token);
    while (this.octetsTotal + tailleOctets > CAPACITE_CACHE_OCTETS && this.evincerPlusAncien()) {
      // Éviction LRU jusqu'à disposer de la place.
    }
    const ttl = nature === "referentiel" ? TTL_REFERENTIEL_MS : TTL_TRANSACTIONNEL_MS;
    const expiration = new Date(this.clock.now().getTime() + ttl);
    this.entrees.set(token, { page, expiration, tailleOctets, identiteGeneration: cle.identiteGeneration });
    this.octetsTotal += tailleOctets;
  }

  /** Purge les entrées liées à une génération d'identité révoquée (logout, nouvelle génération). */
  purgerGeneration(identiteGeneration: number): void {
    for (const [token, entree] of this.entrees) {
      if (entree.identiteGeneration === identiteGeneration) {
        this.entrees.delete(token);
        this.octetsTotal -= entree.tailleOctets;
      }
    }
  }

  private retirer(token: string): void {
    const entree = this.entrees.get(token);
    if (entree !== undefined) {
      this.entrees.delete(token);
      this.octetsTotal -= entree.tailleOctets;
    }
  }

  private purgerExpires(): void {
    const maintenant = this.clock.now().getTime();
    for (const [token, entree] of this.entrees) {
      if (entree.expiration.getTime() <= maintenant) {
        this.entrees.delete(token);
        this.octetsTotal -= entree.tailleOctets;
      }
    }
  }

  private evincerPlusAncien(): boolean {
    const plusAncien = this.entrees.keys().next();
    if (plusAncien.done === true) {
      return false;
    }
    this.retirer(plusAncien.value);
    return true;
  }
}
