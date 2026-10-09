import type { LockManager } from "../ports/lock-manager.js";
import type { IdentiteStockage, TokenStore } from "../ports/token-store.js";
import type { JournalStockage, StoreJson } from "../storage/store-json.js";
import { apresLogout, ecrireGenerations, lireGenerations, sousVerrouIdentite } from "./store-generations.js";

export interface DependancesLogout {
  readonly verrous: LockManager;
  readonly store: StoreJson;
  readonly tokenStore: TokenStore;
  readonly identite: IdentiteStockage;
  readonly nomVerrou: string;
  readonly cheminGenerations: string;
  readonly journal?: JournalStockage;
}

export interface ParametresLogout {
  readonly deadline: Date;
  readonly signal?: AbortSignal;
}

/**
 * `logout` (décision 3, 07 §3) : persiste `revoqueeJusqua = derniereReservee` **avant**
 * `TokenStore.clear()`, sous le même verrou d'identité que `login`/refresh — une réservation en
 * cours (login ou refresh concurrent) ne peut plus committer après ce point. `generations.json`
 * **survit** au logout (jamais supprimé). Idempotent : aucun token existant ⇒ succès silencieux
 * (`TokenStore.clear()` ignore déjà `ENOENT`).
 */
export async function logout(deps: DependancesLogout, parametres: ParametresLogout): Promise<void> {
  await sousVerrouIdentite(
    deps.verrous,
    deps.nomVerrou,
    parametres.deadline,
    parametres.signal,
    deps.journal,
    async () => {
      const etatActuel = await lireGenerations({ store: deps.store, chemin: deps.cheminGenerations });
      const nouvelEtat = apresLogout(etatActuel);
      await ecrireGenerations({ store: deps.store, chemin: deps.cheminGenerations }, nouvelEtat);
      await deps.tokenStore.clear(deps.identite);
    },
  );
}
