import type { LockManager } from "../ports/lock-manager.js";
import type { JournalStockage, StoreJson } from "./store-json.js";

export interface ParametresMiseAJour {
  readonly verrous: LockManager;
  readonly store: StoreJson;
  readonly nomVerrou: string;
  readonly chemin: string;
  readonly type: string;
  readonly deadline: Date;
  readonly signal?: AbortSignal;
  readonly journal?: JournalStockage;
}

/**
 * Primitive de relecture-sous-verrou (07 §4) que T05 (admission quota) et T06 (rotation de
 * tokens) appellent : acquiert le verrou, **relit** la valeur durable, applique `transformer`,
 * écrit, puis libère le verrou dans un `finally`.
 *
 * `transformer` ne doit jamais effectuer d'appel réseau ni d'attente longue : le verrou n'est
 * jamais détenu pendant un refresh ou une réponse réseau (07 §4, 2ᵉ paragraphe).
 *
 * Une erreur de `release()` ne masque jamais l'erreur du corps (revue T04, point 4) : si le
 * transformateur ou l'écriture échouent, c'est cette erreur qui est propagée et l'échec de
 * `release()` est seulement journalisé. `release()` n'échoue que si le corps a réussi.
 */
export async function mettreAJourSousVerrou<T>(
  parametres: ParametresMiseAJour,
  transformer: (valeurActuelle: T | null) => T | Promise<T>,
): Promise<T> {
  const verrou = await parametres.verrous.acquire(parametres.nomVerrou, parametres.deadline, parametres.signal);
  let resultat: T;
  try {
    const actuelle = await parametres.store.lire<T>(parametres.chemin, parametres.type);
    const nouvelle = await transformer(actuelle);
    await parametres.store.ecrire<T>(parametres.chemin, parametres.type, nouvelle);
    resultat = nouvelle;
  } catch (erreurCorps) {
    await verrou.release().catch((erreurRelease: unknown) => {
      parametres.journal?.avertir(
        `Échec de release() du verrou ${parametres.nomVerrou} après échec du corps ; erreur du corps propagée : ${String(erreurRelease)}`,
      );
    });
    throw erreurCorps;
  }
  await verrou.release();
  return resultat;
}
