import { randomBytes } from "node:crypto";
import type { Clock } from "../ports/clock.js";
import { erreurCurseurBusy, erreurCurseurExpire, erreurCurseurMismatch } from "./errors.js";
import type { PositionSource } from "./source-page.js";

/** Expiration d'un curseur (07 §5). */
export const DUREE_VIE_CURSEUR_MS = 15 * 60 * 1000;
/** Capacité maximale en nombre d'états (07 §5). */
export const CAPACITE_MAX_ETATS = 100;
/** Capacité maximale cumulée, en octets estimés (07 §5). */
export const CAPACITE_MAX_OCTETS = 32 * 1024 * 1024;

/**
 * État d'un parcours suspendu (07 §5) : vit uniquement en mémoire de session, jamais sur disque,
 * jamais dans les logs. Une reprise ne garantit pas un snapshot EBP : la vue locale reste
 * partielle (nouveaux éléments insérés entre deux pages distantes non détectés).
 */
export interface EtatCurseur<E> {
  /** Position distante à lire pour poursuivre le parcours. */
  readonly position: PositionSource;
  /** Éléments déjà filtrés mais non encore rendus de la dernière page lue. */
  readonly elementsEnAttente: readonly E[];
  /** IDs déjà rendus au client, pour ne jamais rendre un élément deux fois à la reprise. */
  readonly idsVus: ReadonlySet<string>;
  /** Ensemble d'`idElement` de la dernière page lue, pour détecter une page répétée à la reprise. */
  readonly idsDernierePage: readonly string[];
  /** Nombre cumulé d'éléments filtrés depuis le début du parcours (tous appels confondus). */
  readonly totalFiltreAccumule: number;
  /** Dernier `totalSource` connu, tous appels confondus. */
  readonly totalSourceConnu: number | null;
  /** `true` quand la source a déjà déclaré sa fin (`suivant: null`) au moment de la suspension. */
  readonly sourceTerminee: boolean;
}

interface Entree<E> {
  readonly empreinte: string;
  readonly identiteGeneration: number;
  readonly etat: EtatCurseur<E>;
  readonly expiration: Date;
  readonly tailleOctets: number;
}

function estimerTailleOctets(etat: EtatCurseur<unknown>): number {
  try {
    return Buffer.byteLength(
      JSON.stringify({
        position: etat.position,
        elementsEnAttente: etat.elementsEnAttente,
        idsVus: [...etat.idsVus],
        idsDernierePage: etat.idsDernierePage,
      }),
      "utf8",
    );
  } catch {
    // Sérialisation impossible (référence circulaire…) : traité comme maximal, jamais ignoré.
    return CAPACITE_MAX_OCTETS + 1;
  }
}

/**
 * Magasin de curseurs en mémoire de session (07 §5). Jeton opaque et aléatoire (`node:crypto`,
 * 128 bits), jamais dérivé de l'état ni décodable. Un seul consommateur par curseur :
 * `consommer` retire l'état de la table disponible et le marque « en cours » jusqu'à `liberer` ;
 * une seconde consommation pendant cette fenêtre lève `CURSOR_BUSY`, et le jeton consommé ne
 * redonne jamais silencieusement une seconde page différente (`liberer` ne le remet jamais dans
 * la table disponible — un nouveau jeton est émis par le moteur quand `hasMore` reste vrai).
 */
export class MagasinCurseurs {
  private readonly etats = new Map<string, Entree<unknown>>();
  private readonly enCours = new Set<string>();
  private octetsTotal = 0;
  private readonly clock: Clock;

  constructor(clock: Clock) {
    this.clock = clock;
  }

  /**
   * Enregistre un état et renvoie son jeton, ou `null` si la capacité ne peut être dégagée même
   * après éviction LRU (résultat partiel `cursor_capacity`, sans promesse de reprise).
   */
  enregistrer<E>(empreinte: string, identiteGeneration: number, etat: EtatCurseur<E>): string | null {
    this.purgerExpires();
    const tailleOctets = estimerTailleOctets(etat);
    if (tailleOctets > CAPACITE_MAX_OCTETS) {
      return null;
    }
    while (
      (this.etats.size >= CAPACITE_MAX_ETATS || this.octetsTotal + tailleOctets > CAPACITE_MAX_OCTETS) &&
      this.evincerPlusAncien()
    ) {
      // Éviction LRU jusqu'à disposer de la place, ou jusqu'à épuisement de la table.
    }
    if (this.etats.size >= CAPACITE_MAX_ETATS || this.octetsTotal + tailleOctets > CAPACITE_MAX_OCTETS) {
      return null;
    }
    const token = randomBytes(16).toString("hex");
    const expiration = new Date(this.clock.now().getTime() + DUREE_VIE_CURSEUR_MS);
    this.etats.set(token, { empreinte, identiteGeneration, etat, expiration, tailleOctets });
    this.octetsTotal += tailleOctets;
    return token;
  }

  /**
   * Consomme un jeton : vérifie expiration, usage concurrent puis correspondance d'identité
   * (`CURSOR_EXPIRED`, `CURSOR_BUSY`, `CURSOR_MISMATCH`), retire l'état de la table disponible et
   * le marque « en cours ». Appeler `liberer` une fois le parcours terminé (succès ou échec).
   */
  consommer<E>(token: string, empreinteAttendue: string): EtatCurseur<E> {
    this.purgerExpires();
    if (this.enCours.has(token)) {
      throw erreurCurseurBusy();
    }
    const entree = this.etats.get(token);
    if (entree === undefined) {
      throw erreurCurseurExpire();
    }
    if (entree.empreinte !== empreinteAttendue) {
      throw erreurCurseurMismatch();
    }
    this.etats.delete(token);
    this.octetsTotal -= entree.tailleOctets;
    this.enCours.add(token);
    return entree.etat as EtatCurseur<E>;
  }

  /** Libère le verrou « en cours » : le jeton reste définitivement consommé (jamais réutilisable). */
  liberer(token: string): void {
    this.enCours.delete(token);
  }

  /** Purge les états liés à une génération d'identité révoquée (logout, nouvelle génération). */
  purgerGeneration(identiteGeneration: number): void {
    for (const [token, entree] of this.etats) {
      if (entree.identiteGeneration === identiteGeneration) {
        this.etats.delete(token);
        this.octetsTotal -= entree.tailleOctets;
      }
    }
  }

  private purgerExpires(): void {
    const maintenant = this.clock.now().getTime();
    for (const [token, entree] of this.etats) {
      if (entree.expiration.getTime() <= maintenant) {
        this.etats.delete(token);
        this.octetsTotal -= entree.tailleOctets;
      }
    }
  }

  private evincerPlusAncien(): boolean {
    const plusAncien = this.etats.keys().next();
    if (plusAncien.done === true) {
      return false;
    }
    const token = plusAncien.value;
    const entree = this.etats.get(token);
    this.etats.delete(token);
    if (entree !== undefined) {
      this.octetsTotal -= entree.tailleOctets;
    }
    return true;
  }
}
