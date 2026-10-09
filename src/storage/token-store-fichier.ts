import type { EnregistrementToken, TokenStore } from "../ports/token-store.js";
import { depuisErreurFichier } from "./errors.js";
import type { OperationsFichier } from "./operations-fichier.js";
import type { StoreJson } from "./store-json.js";

const TYPE_TOKENS = "tokens";

export interface DependancesTokenStoreFichier {
  /** Chemin absolu de `tokens.json`, déjà résolu par l'appelant via `identiteStore()` (T02). */
  readonly chemin: string;
  readonly store: StoreJson;
  readonly operations: OperationsFichier;
}

/**
 * `TokenStore` adossé au store atomique (décision 1, fiche T04) : aucune logique de refresh, le
 * cycle de vie des tokens appartient à T06. L'enregistrement persiste tous les champs de
 * `EnregistrementToken` tels que fournis par l'appelant ; ne jamais faire traverser une enveloppe
 * `Secret` par ce store, elle se sérialiserait en `"[redacted]"`.
 *
 * **Une instance est liée à une seule identité de stockage** : `chemin` est le `tokens.json`
 * déjà résolu pour cette identité (07 §2), `read`/`write`/`clear` l'ignorent jamais mais ne
 * couvrent que ce fichier. L'appelant (T06) doit créer une instance par identité, jamais en
 * réutiliser une pour une identité différente.
 */
export function creerTokenStoreFichier(deps: DependancesTokenStoreFichier): TokenStore {
  return {
    async read(): Promise<EnregistrementToken | null> {
      return deps.store.lire<EnregistrementToken>(deps.chemin, TYPE_TOKENS);
    },

    async write(_identite, enregistrement: EnregistrementToken): Promise<void> {
      await deps.store.ecrire<EnregistrementToken>(deps.chemin, TYPE_TOKENS, enregistrement);
    },

    async clear(): Promise<void> {
      try {
        await deps.operations.supprimer(deps.chemin);
      } catch (erreur) {
        if ((erreur as NodeJS.ErrnoException).code === "ENOENT") {
          return;
        }
        throw depuisErreurFichier(erreur, deps.chemin);
      }
    },
  };
}
