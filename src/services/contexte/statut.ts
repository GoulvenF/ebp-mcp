import type { Environnement } from "../../domain/capabilities.js";
import type { Mode } from "../../domain/envelope.js";
import type { ConfigResolue } from "../../config/resolution.js";
import type { Identifiant } from "../../config/identifiers.js";
import type { TokenStore } from "../../ports/token-store.js";
import type { QuotaStore } from "../../ports/quota-store.js";
import { diagnostiquerAuth } from "../../auth/diagnostic.js";
import type { DiagnosticAuth } from "../../auth/diagnostic.js";
import type { ClaimsIdToken } from "../../auth/client-token.js";

/**
 * Dépendances de `ebp_statut` (D-T12-11) : `tokenStore`/`quotaStore` sont lus localement, sans
 * réseau (07 §3/§4). `claims` est une dépendance **optionnelle** (07 §3, affichage local non
 * vérifié) ; absente ⇒ `null`, jamais un appel pour les obtenir.
 */
export interface DepsStatutContexte {
  readonly tokenStore: TokenStore;
  readonly quotaStore: QuotaStore;
  readonly claims?: ClaimsIdToken | null;
  readonly tentativesAuth?: number;
}

export interface QuotaGroupeStatut {
  readonly groupe: string;
  readonly quota_jour_restant: number;
  readonly quota_utilisable: number;
  readonly quota_estime: boolean;
  readonly max_par_jour: number;
  readonly reserve: number;
}

export interface StatutContexteResultat {
  readonly profil: string;
  readonly environnement: Environnement;
  readonly mode: Mode;
  readonly dossier_actif: string | null;
  readonly auth: DiagnosticAuth;
  readonly quota: QuotaGroupeStatut[];
}

/**
 * `ebp_statut` (D-T12-11, 07 §3/§4/§6) : 0 appel réseau. `auth` vient de `diagnostiquerAuth`, qui
 * ne sérialise jamais access/refresh token, `client_secret` ni `subscriptionKey`. `quota` couvre
 * les groupes utilisés par les familles **actives** du profil, dédoublonnés (un groupe partagé par
 * deux familles n'apparaît qu'une fois), avec `max_par_jour`/`reserve` issus de la config.
 */
export async function statutContexte(
  deps: DepsStatutContexte,
  config: ConfigResolue,
  mode: Mode,
  sessionAlias: Identifiant | null,
): Promise<StatutContexteResultat> {
  const enregistrement = await deps.tokenStore.read({
    profil: config.profil,
    environnement: config.environnement,
    empreinteClientId: config.identiteStore.empreinteClient,
  });
  const auth = diagnostiquerAuth({
    profil: config.profil,
    environnement: config.environnement,
    empreinteClient: config.identiteStore.empreinteClient,
    enregistrement,
    pkce: config.pkce,
    claims: deps.claims ?? null,
    tentativesAuth: deps.tentativesAuth ?? 0,
  });

  const groupesUtilises = new Set<Identifiant>();
  for (const famille of config.famillesActives) {
    groupesUtilises.add(config.abonnementPourFamille(famille).groupeQuota);
  }

  const quota: QuotaGroupeStatut[] = [];
  for (const groupe of groupesUtilises) {
    const statutQuota = await deps.quotaStore.getStatut(groupe);
    const groupeConfig = config.groupesQuota.get(groupe);
    if (groupeConfig === undefined) {
      throw new Error(`Groupe de quota "${groupe}" utilisé par une famille active mais absent de la config résolue.`);
    }
    quota.push({
      groupe,
      quota_jour_restant: statutQuota.quotaJourRestant,
      quota_utilisable: statutQuota.quotaUtilisable,
      quota_estime: statutQuota.quotaEstime,
      max_par_jour: groupeConfig.maxPerDay,
      reserve: groupeConfig.reserve,
    });
  }

  return {
    profil: config.profil,
    environnement: config.environnement,
    mode,
    dossier_actif: sessionAlias ?? config.aliasDefaut ?? null,
    auth,
    quota,
  };
}
