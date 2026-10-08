import type { LockManager } from "../ports/lock-manager.js";
import type { StoreJson } from "./store-json.js";

export interface ParametresMiseAJour {
  readonly verrous: LockManager;
  readonly store: StoreJson;
  readonly nomVerrou: string;
  readonly chemin: string;
  readonly type: string;
  readonly deadline: Date;
  readonly signal?: AbortSignal;
}

/**
 * Primitive de relecture-sous-verrou (07 §4) que T05 (admission quota) et T06 (rotation de
 * tokens) appellent : acquiert le verrou, **relit** la valeur durable, applique `transformer`,
 * écrit, puis libère le verrou dans un `finally`.
 *
 * `transformer` ne doit jamais effectuer d'appel réseau ni d'attente longue : le verrou n'est
 * jamais détenu pendant un refresh ou une réponse réseau (07 §4, 2ᵉ paragraphe).
 */
export async function mettreAJourSousVerrou<T>(
  parametres: ParametresMiseAJour,
  transformer: (valeurActuelle: T | null) => T | Promise<T>,
): Promise<T> {
  const verrou = await parametres.verrous.acquire(parametres.nomVerrou, parametres.deadline, parametres.signal);
  try {
    const actuelle = await parametres.store.lire<T>(parametres.chemin, parametres.type);
    const nouvelle = await transformer(actuelle);
    await parametres.store.ecrire<T>(parametres.chemin, parametres.type, nouvelle);
    return nouvelle;
  } finally {
    await verrou.release();
  }
}
