import { createHash } from "node:crypto";
import type { LockManager } from "../ports/lock-manager.js";
import type { JournalStockage, StoreJson } from "../storage/store-json.js";

/** Type d'enveloppe `StoreJson` pour `generations.json` (décision 3, 07 §3). */
export const TYPE_GENERATIONS = "auth-generations";

export interface EtatGenerations {
  readonly schemaVersion: 1;
  readonly derniereReservee: number;
  readonly revoqueeJusqua: number;
}

export function etatGenerationsInitial(): EtatGenerations {
  return { schemaVersion: 1, derniereReservee: 0, revoqueeJusqua: 0 };
}

/** Pure : aucune E/S. Transformation à appliquer sous verrou lors d'une réservation. */
export function apresReservation(etat: EtatGenerations | null): EtatGenerations {
  const actuel = etat ?? etatGenerationsInitial();
  return { schemaVersion: 1, derniereReservee: actuel.derniereReservee + 1, revoqueeJusqua: actuel.revoqueeJusqua };
}

/** Pure : aucune E/S. Transformation à appliquer sous verrou lors d'un logout. */
export function apresLogout(etat: EtatGenerations | null): EtatGenerations {
  const actuel = etat ?? etatGenerationsInitial();
  return { schemaVersion: 1, derniereReservee: actuel.derniereReservee, revoqueeJusqua: actuel.derniereReservee };
}

/**
 * Règle de commit (décision 3, A05) : une génération `G` ne peut être écrite dans `tokens.json`
 * que si elle n'a pas été invalidée (`G > revoqueeJusqua`) et qu'elle est toujours la dernière
 * réservée (`G === derniereReservee`) — relu au moment du commit, sous le même verrou que
 * l'écriture de `tokens.json`. Pure : l'appelant est responsable de la relecture sous verrou.
 */
export function commitAutorise(etat: EtatGenerations | null, generation: number): boolean {
  const actuel = etat ?? etatGenerationsInitial();
  return generation > actuel.revoqueeJusqua && generation === actuel.derniereReservee;
}

export interface DependancesGenerationsIO {
  readonly store: StoreJson;
  readonly chemin: string;
}

export async function lireGenerations(deps: DependancesGenerationsIO): Promise<EtatGenerations | null> {
  return deps.store.lire<EtatGenerations>(deps.chemin, TYPE_GENERATIONS);
}

export async function ecrireGenerations(deps: DependancesGenerationsIO, etat: EtatGenerations): Promise<void> {
  await deps.store.ecrire<EtatGenerations>(deps.chemin, TYPE_GENERATIONS, etat);
}

/**
 * Nom de verrou dérivé de `identite.cle` (décision 3), conforme à `/^[a-z0-9][a-z0-9_-]{0,63}$/` :
 * `cle` (profil.environnement.empreinte) peut dépasser 64 caractères ou contenir des points, donc
 * on hache plutôt que de le réutiliser tel quel.
 */
export function nomVerrouIdentite(cle: string): string {
  const empreinte = createHash("sha256").update(cle, "utf8").digest("hex").slice(0, 32);
  return `auth-${empreinte}`;
}

/**
 * Acquiert `nomVerrou` puis exécute `corps`, release dans un `finally` (même politique que
 * `mettreAJourSousVerrou` : une erreur de `release()` ne masque jamais l'erreur du corps).
 *
 * Contrairement à `mettreAJourSousVerrou` (un seul fichier), `corps` peut lire/écrire **plusieurs**
 * fichiers (`generations.json` ET `tokens.json`) sous une seule détention du verrou — c'est
 * indispensable pour la rotation (A05) : réservation, vérification de commit et écriture de
 * `tokens.json` doivent voir un état cohérent sans fenêtre de concurrence entre deux acquisitions
 * séparées du même verrou.
 */
export async function sousVerrouIdentite<T>(
  verrous: LockManager,
  nomVerrou: string,
  deadline: Date,
  signal: AbortSignal | undefined,
  journal: JournalStockage | undefined,
  corps: () => Promise<T>,
): Promise<T> {
  const verrou = await verrous.acquire(nomVerrou, deadline, signal);
  let resultat: T;
  try {
    resultat = await corps();
  } catch (erreurCorps) {
    await verrou.release().catch((erreurRelease: unknown) => {
      journal?.avertir(
        `Échec de release() du verrou ${nomVerrou} après échec du corps ; erreur du corps propagée : ${String(erreurRelease)}`,
      );
    });
    throw erreurCorps;
  }
  await verrou.release();
  return resultat;
}
