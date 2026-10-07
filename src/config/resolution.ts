import { z } from "zod";
import type { Environnement, Famille } from "../domain/capabilities.js";
import type { DossiersParEnvironnement } from "./dossiers.js";
import { normaliserDossiers } from "./dossiers.js";
import { erreurConfigInvalide } from "./errors.js";
import type { Identifiant } from "./identifiers.js";
import { estIdentifiant } from "./identifiers.js";
import type { VariablesEnv } from "./env.js";
import type { Journal } from "./journal.js";
import { estRedirectUriLoopback, schemaFichierConfig } from "./schema.js";
import type { GroupeQuotaBrut } from "./schema.js";
import { secret } from "./secret.js";
import type { Secret } from "./secret.js";
import { identiteStore } from "./store-identity.js";
import type { IdentiteStore } from "./store-identity.js";

/** Options CLI acceptées par `resoudreConfig` : jamais de secret (décision 8, 07 §2). */
export interface OptionsCli {
  profile?: string;
  env?: Environnement;
  clientId?: string;
  redirectUri?: string;
}

export interface GroupeQuota {
  readonly maxPerDay: number;
  readonly reserve: number;
  readonly minIntervalMs: number;
  readonly resetTimezone: string;
}

export interface AbonnementFamille {
  readonly cle: Secret | null;
  readonly groupeQuota: Identifiant;
}

export interface ConfigResolue {
  readonly profil: Identifiant;
  readonly environnement: Environnement;
  readonly clientId: string;
  readonly clientSecret: Secret | null;
  readonly redirectUri: string;
  readonly pkce: "required" | "disabled";
  readonly famillesActives: readonly Famille[];
  readonly groupesQuota: ReadonlyMap<Identifiant, GroupeQuota>;
  readonly dossiers: DossiersParEnvironnement;
  readonly aliasDefaut: Identifiant | null;
  readonly redactPii: boolean;
  readonly identiteStore: IdentiteStore;
  abonnementPourFamille(famille: Famille): AbonnementFamille;
}

export interface EntreesResolution {
  /** Contenu brut de `config.json`, ou `null` si le fichier n'existe pas (07 §2). */
  readonly contenuFichier: string | null;
  readonly variablesEnv: VariablesEnv;
  readonly cli: OptionsCli;
  readonly racine: string;
  readonly journal: Journal;
}

function detailsDepuisZod(erreur: z.ZodError): Record<string, unknown> {
  return {
    problemes: erreur.issues.map((i) => ({ chemin: i.path.join("."), message: i.message })),
  };
}

function versGroupeQuota(
  nom: string,
  brut: GroupeQuotaBrut,
  reserveOverride: number | undefined,
): GroupeQuota {
  const reserve = reserveOverride ?? brut.reserve;
  if (reserveOverride !== undefined && reserve >= brut.maxPerDay) {
    throw erreurConfigInvalide(
      `EBP_QUOTA_RESERVE (${reserveOverride}) rend le groupe de quota "${nom}" invalide : reserve doit être strictement inférieure à maxPerDay (${brut.maxPerDay}).`,
      { variable: "EBP_QUOTA_RESERVE", groupe: nom },
    );
  }
  return {
    maxPerDay: brut.maxPerDay,
    reserve,
    minIntervalMs: brut.minIntervalMs,
    resetTimezone: brut.resetTimezone,
  };
}

/**
 * Pure et synchrone (décision 1, 07 §2) : reçoit le contenu brut déjà lu, les variables d'env déjà
 * extraites et les options CLI déjà parsées. Aucune lecture disque ici ; c'est `chargerConfig` qui
 * s'en charge avant d'appeler cette fonction.
 */
export function resoudreConfig(entrees: EntreesResolution): ConfigResolue {
  const brutJson: unknown =
    entrees.contenuFichier === null
      ? { schemaVersion: 1, profiles: {}, quotaGroups: {} }
      : parseJson(entrees.contenuFichier);

  const resultat = schemaFichierConfig.safeParse(brutJson);
  if (!resultat.success) {
    throw erreurConfigInvalide("Fichier config.json invalide.", detailsDepuisZod(resultat.error));
  }
  const fichier = resultat.data;

  const nomProfil = entrees.cli.profile ?? entrees.variablesEnv.profile ?? "default";
  const profilTrouve =
    estIdentifiant(nomProfil) && Object.hasOwn(fichier.profiles, nomProfil)
      ? fichier.profiles[nomProfil]
      : undefined;
  if (profilTrouve === undefined) {
    throw erreurConfigInvalide(`Profil "${nomProfil}" absent de config.json.`, { profil: nomProfil });
  }
  const profilBrut = profilTrouve;
  const profil = nomProfil as Identifiant;

  const environnement: Environnement = entrees.cli.env ?? entrees.variablesEnv.env ?? profilBrut.env;
  const clientId = entrees.cli.clientId ?? entrees.variablesEnv.clientId ?? profilBrut.clientId;

  const clientSecretTexte = entrees.variablesEnv.clientSecret ?? profilBrut.clientSecret ?? null;
  const subscriptionKeyDefautTexte = entrees.variablesEnv.subscriptionKey ?? profilBrut.subscriptionKey ?? null;

  const redirectUri = entrees.cli.redirectUri ?? entrees.variablesEnv.redirectUri ?? profilBrut.redirectUri;
  if (!estRedirectUriLoopback(redirectUri)) {
    throw erreurConfigInvalide("redirectUri résolu n'est pas loopback.", { champ: "redirectUri" });
  }

  const famillesActives = profilBrut.enabledFamilies;

  const nomsGroupesUtilises = new Set<string>([
    profilBrut.quotaGroup,
    ...Object.values(profilBrut.subscriptionByFamily ?? {}).map((s) => s.quotaGroup),
  ]);
  const groupesQuota = new Map<Identifiant, GroupeQuota>();
  for (const nom of nomsGroupesUtilises) {
    // `Object.hasOwn` et non un accès direct : un nom comme `constructor` satisfait
    // RE_IDENTIFIANT et serait sinon résolu sur la chaîne de prototypes (décision 3).
    const brut = Object.hasOwn(fichier.quotaGroups, nom) ? fichier.quotaGroups[nom] : undefined;
    if (brut === undefined) {
      throw erreurConfigInvalide(`Groupe de quota "${nom}" non déclaré.`, { groupe: nom });
    }
    groupesQuota.set(nom as Identifiant, versGroupeQuota(nom, brut, entrees.variablesEnv.quotaReserve));
  }

  const dossiers = normaliserDossiers(profilBrut);
  const aliasDefautTexte = profilBrut.defaultDossier?.[environnement];
  const aliasDefaut = aliasDefautTexte !== undefined ? (aliasDefautTexte as Identifiant) : null;

  const redactPii = entrees.variablesEnv.redactPii ?? false;
  const store = identiteStore(entrees.racine, profil, environnement, clientId);

  const clientSecret = clientSecretTexte === null ? null : secret(clientSecretTexte);

  function abonnementPourFamille(famille: Famille): AbonnementFamille {
    const specifique = profilBrut.subscriptionByFamily?.[famille];
    const cleTexte = specifique?.key ?? subscriptionKeyDefautTexte;
    return {
      cle: cleTexte !== null && cleTexte !== undefined ? secret(cleTexte) : null,
      groupeQuota: (specifique?.quotaGroup ?? profilBrut.quotaGroup) as Identifiant,
    };
  }

  return {
    profil,
    environnement,
    clientId,
    clientSecret,
    redirectUri,
    pkce: profilBrut.pkce,
    famillesActives,
    groupesQuota,
    dossiers,
    aliasDefaut,
    redactPii,
    identiteStore: store,
    abonnementPourFamille,
  };
}

function parseJson(texte: string): unknown {
  try {
    return JSON.parse(texte);
  } catch {
    throw erreurConfigInvalide("config.json n'est pas un JSON valide.");
  }
}

/** Vue sûre pour `status` (07 §2) : aucune clé, aucun secret, aucun `clientId` en clair. */
export function vuePourStatut(config: ConfigResolue): Record<string, unknown> {
  return {
    profil: config.profil,
    environnement: config.environnement,
    pkce: config.pkce,
    famillesActives: config.famillesActives,
    dossiers: {
      prod: config.dossiers.prod.map((d) => d.alias),
      preprod: config.dossiers.preprod.map((d) => d.alias),
    },
    aliasDefaut: config.aliasDefaut,
    groupesQuota: Array.from(config.groupesQuota.keys()),
    redactPii: config.redactPii,
    identite: config.identiteStore.cle,
  };
}
