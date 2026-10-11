import type { Enveloppe, Meta, Mode } from "../../domain/envelope.js";
import type { ResultatService } from "../../services/commun/types.js";
import { PLAFOND_SORTIE_OCTETS, tailleJsonUtf8 } from "./plafonds.js";

/** Compléments de `meta` connus seulement au niveau de l'exécution (T12, 07 §5), pas du service. */
export interface MetaExecution {
  readonly mode: Mode;
  readonly observeA: string;
  readonly dureeMs: number;
  readonly appelsApi: number;
  readonly appelsAuth: number;
  readonly quotaJourRestant: number | null;
  readonly quotaUtilisable: number | null;
  readonly quotaEstime: boolean | null;
  /** Avertissements supplémentaires de l'exécution (ex. lecture du quota impossible), ajoutés après ceux du service. */
  readonly avertissementsSupplementaires?: readonly string[];
}

function construireMeta(
  resultat: Pick<
    ResultatService<unknown>,
    "approximatif" | "completude" | "raison_arret" | "sources" | "avertissements"
  >,
  extras: MetaExecution,
): Meta {
  return {
    appels_api: extras.appelsApi,
    appels_auth: extras.appelsAuth,
    duree_ms: extras.dureeMs,
    quota_jour_restant: extras.quotaJourRestant,
    quota_utilisable: extras.quotaUtilisable,
    quota_estime: extras.quotaEstime,
    approximatif: resultat.approximatif,
    completude: resultat.completude,
    raison_arret: resultat.raison_arret,
    sources: [...resultat.sources],
    avertissements: [...resultat.avertissements, ...(extras.avertissementsSupplementaires ?? [])],
    mode: extras.mode,
    observe_a: extras.observeA,
  };
}

/**
 * Règles du brut (D-T12-7) : `resultat.bruts === null` signifie `inclure_brut: false` (champ
 * absent de l'enveloppe, jamais sérialisé à `null`) ; sinon aligné 1:1 sur `resultats`, sauf si sa
 * taille sérialisée dépasse le plafond de sortie, auquel cas `bruts: null` avec avertissement —
 * jamais mesuré avec le reste de la liste (07 §7).
 */
function appliquerReglesBrut<T>(enveloppe: Enveloppe<T>, bruts: readonly unknown[] | null): Enveloppe<T> {
  if (bruts === null) {
    return enveloppe;
  }
  if (tailleJsonUtf8(bruts) > PLAFOND_SORTIE_OCTETS) {
    return {
      ...enveloppe,
      bruts: null,
      meta: { ...enveloppe.meta, avertissements: [...enveloppe.meta.avertissements, "brut omis : plafond 1 Mio"] },
    };
  }
  return { ...enveloppe, bruts: [...bruts] };
}

/** `construireEnveloppe` depuis un `ResultatService` (D-T12-3/D-T12-7, 07 §5), pour les 14 outils métier. */
export function construireEnveloppe<T>(resultat: ResultatService<T>, extras: MetaExecution): Enveloppe<T> {
  const enveloppe: Enveloppe<T> = {
    dossier: resultat.dossier,
    resultats: [...resultat.resultats],
    pagination: resultat.pagination,
    meta: construireMeta(resultat, extras),
  };
  return appliquerReglesBrut(enveloppe, resultat.bruts);
}

/**
 * `construireEnveloppe` depuis un objet de contexte (D-T12-3, 07 §5), pour les outils de contexte
 * globaux (`ebp_lister_dossiers`, `ebp_choisir_dossier`, `ebp_statut`, lot 2/3) : `resultats`
 * porte 0 ou 1 objet, `pagination: null`, jamais de brut.
 */
export function construireEnveloppeContexte<T>(
  dossier: string | null,
  resultat: T | null,
  extras: MetaExecution & { readonly sources?: readonly string[]; readonly avertissements?: readonly string[] },
): Enveloppe<T> {
  return {
    dossier,
    resultats: resultat === null ? [] : [resultat],
    pagination: null,
    meta: construireMeta(
      {
        approximatif: false,
        completude: "complete",
        raison_arret: null,
        sources: extras.sources ?? [],
        avertissements: extras.avertissements ?? [],
      },
      extras,
    ),
  };
}
