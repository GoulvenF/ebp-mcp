import { McpError } from "@modelcontextprotocol/sdk/types.js";
import type { Resource, ResourceTemplate } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { exigerFamilleActive, resoudreDossier } from "../../config/dossiers.js";
import type { ConfigResolue } from "../../config/resolution.js";
import { enveloppeSchema } from "../../domain/schemas/commun.js";
import { CompteGeneralSchema, JournalSchema, TauxTvaCptSchema } from "../../domain/schemas/compta.js";
import { TauxTvaSchema } from "../../domain/schemas/gescom.js";
import type { Enveloppe, Mode } from "../../domain/envelope.js";
import { idRequeteCourt } from "../../http/journal-http.js";
import { erreurNonTrouve } from "../../services/commun/erreurs.js";
import { listerDossiersContexte } from "../../services/contexte/lister-dossiers.js";
import { ListerDossiersContexteSchema } from "../../services/contexte/schemas.js";
import { GLOSSAIRE, TermeGlossaireSchema } from "../../services/ressources/glossaire.js";
import { RESSOURCES_DOSSIER } from "../../services/ressources/registre.js";
import { ResultatExercicesSchema } from "../execution/registre.js";
import { executerServiceDossier } from "../execution/pipeline.js";
import type { DepsProcessus, OptionsExecution, SessionMcp } from "../execution/types.js";
import { appliquerPolitiqueSortie, construireEnveloppeContexte, entreeJournalErreur, verifierPlafondFiche, verifierPlafondFinal, versErreurMetier } from "../sortie/index.js";
import type { CodeErreur } from "../../domain/errors.js";

/** Schéma de sortie par suffixe de ressource de dossier (D-T12-13), un seul élément de `resultats`. */
const SCHEMAS_SORTIE_RESSOURCES_DOSSIER: Record<string, z.ZodType> = {
  exercices: ResultatExercicesSchema,
  journaux: JournalSchema,
  "plan-comptable": CompteGeneralSchema,
  "taux-tva": z.union([TauxTvaCptSchema, TauxTvaSchema]),
};

const URI_DOSSIERS = "ebp://dossiers";
const URI_GLOSSAIRE = "ebp://glossaire";

/**
 * `resources/list` (D-T12-13) : `ebp://dossiers`, `ebp://glossaire`, puis pour chaque dossier
 * configuré de l'environnement actif **et** de famille active, les suffixes applicables à sa
 * famille.
 */
export function construireListeRessources(config: ConfigResolue): Resource[] {
  const ressources: Resource[] = [
    { uri: URI_DOSSIERS, name: "dossiers", title: "Dossiers configurés", mimeType: "application/json" },
    { uri: URI_GLOSSAIRE, name: "glossaire", title: "Glossaire FR/EN", mimeType: "application/json" },
  ];
  const liste = config.dossiers[config.environnement];
  for (const dossier of liste) {
    if (!config.famillesActives.includes(dossier.famille)) {
      continue;
    }
    for (const definition of RESSOURCES_DOSSIER) {
      if (!definition.familles.includes(dossier.famille)) {
        continue;
      }
      ressources.push({
        uri: `ebp://${dossier.alias}/${definition.suffixe}`,
        name: `${dossier.alias}-${definition.suffixe}`,
        title: `${definition.suffixe} (${dossier.alias})`,
        mimeType: "application/json",
      });
    }
  }
  return ressources;
}

/** `resources/templates/list` (D-T12-13) : les 4 gabarits v0.1, aucun autre. */
export function construireListeGabarits(): ResourceTemplate[] {
  return [
    { uriTemplate: "ebp://{dossier}/exercices", name: "exercices", title: "Exercices comptables", mimeType: "application/json" },
    { uriTemplate: "ebp://{dossier}/journaux", name: "journaux", title: "Journaux comptables", mimeType: "application/json" },
    {
      uriTemplate: "ebp://{dossier}/plan-comptable",
      name: "plan-comptable",
      title: "Plan comptable",
      mimeType: "application/json",
    },
    { uriTemplate: "ebp://{dossier}/taux-tva", name: "taux-tva", title: "Taux de TVA", mimeType: "application/json" },
  ];
}

type UriAnalysee =
  | { readonly type: "dossiers" }
  | { readonly type: "glossaire" }
  | { readonly type: "dossier"; readonly alias: string; readonly suffixe: string };

/** Analyse stricte de l'URI (D-T12-13) : jamais résolue par la session, uniquement par sa forme et la config. */
function analyserUri(uri: string): UriAnalysee | null {
  if (uri === URI_DOSSIERS) {
    return { type: "dossiers" };
  }
  if (uri === URI_GLOSSAIRE) {
    return { type: "glossaire" };
  }
  const correspondance = /^ebp:\/\/([^/]+)\/([^/]+)$/.exec(uri);
  if (correspondance === null) {
    return null;
  }
  return { type: "dossier", alias: correspondance[1]!, suffixe: correspondance[2]! };
}

/** Mappage des 19 codes vers les 3 codes JSON-RPC exposés par `resources/read` (issue T12-3). */
function codeJsonRpcPourErreur(code: CodeErreur): number {
  if (code === "NOT_FOUND") {
    return -32002;
  }
  if (code === "INVALID_ARGUMENT" || code === "UNSUPPORTED_CAPABILITY" || code === "DOSSIER_REQUIRED" || code === "DOSSIER_UNKNOWN") {
    return -32602;
  }
  return -32603;
}

/** `ebp://glossaire` (D-T12-13) : liste statique, 0 réseau, enveloppe globale sans dossier. */
function enveloppeGlossaire(mode: Mode, debut: Date, fin: Date): Enveloppe<(typeof GLOSSAIRE)[number]> {
  return {
    dossier: null,
    resultats: [...GLOSSAIRE],
    pagination: { renvoyes: GLOSSAIRE.length, total: GLOSSAIRE.length, total_source: GLOSSAIRE.length, hasMore: false, curseur: null },
    meta: {
      appels_api: 0,
      appels_auth: 0,
      duree_ms: fin.getTime() - debut.getTime(),
      quota_jour_restant: null,
      quota_utilisable: null,
      quota_estime: null,
      approximatif: false,
      completude: "complete",
      raison_arret: null,
      sources: [],
      avertissements: [],
      mode,
      observe_a: fin.toISOString(),
    },
  };
}

function finaliserEtSerialiser<T>(enveloppe: Enveloppe<T>, schemaResultat: z.ZodType, nomRessource: string): string {
  const schemaEnveloppe = enveloppeSchema(schemaResultat);
  const parse = schemaEnveloppe.safeParse(enveloppe);
  if (!parse.success) {
    throw new Error(`Enveloppe de sortie invalide pour la ressource \`${nomRessource}\` (schéma de sortie non respecté).`);
  }
  const validee = parse.data as Enveloppe<T>;
  verifierPlafondFiche(validee);
  const finale = verifierPlafondFinal(validee);
  return JSON.stringify(finale);
}

/** `ebp://{alias}/{suffixe}` (D-T12-13) : même pipeline que D-T12-3 (budget, deadline, cache, PII, plafond). */
async function lireRessourceDossier(
  deps: DepsProcessus,
  options: OptionsExecution,
  debut: Date,
  alias: string,
  suffixe: string,
): Promise<string> {
  const definition = RESSOURCES_DOSSIER.find((d) => d.suffixe === suffixe);
  const schemaResultat = SCHEMAS_SORTIE_RESSOURCES_DOSSIER[suffixe];
  if (definition === undefined || schemaResultat === undefined) {
    throw erreurNonTrouve({ raison: "ressource" });
  }

  // Alias résolu par la config seule, jamais par la session (D-T12-13) : `aliasSession: null`.
  const dossier = resoudreDossier(deps.config, { dossier: alias }, null);
  exigerFamilleActive(deps.config, dossier.famille);

  // Étapes 5 à 8 du pipeline (D-T12-3/D-T12-13), communes avec `executerOutilMetier` : même
  // `ExecutionContext` (budget, deadline), même `ContexteHttp`, même appel de service, même
  // politique de sortie, même validation de schéma et plafonds.
  const enveloppeFinale = await executerServiceDossier(
    deps,
    options,
    debut,
    dossier,
    definition.service,
    {},
    schemaResultat,
    `ebp://{dossier}/${suffixe}`,
  );
  return JSON.stringify(enveloppeFinale);
}

async function resoudreEtLireRessource(
  deps: DepsProcessus,
  sessionCtx: SessionMcp,
  options: OptionsExecution,
  uri: string,
  debut: Date,
): Promise<string> {
  const analyse = analyserUri(uri);
  if (analyse === null) {
    throw erreurNonTrouve({ raison: "uri" });
  }
  if (analyse.type === "dossiers") {
    const resultat = listerDossiersContexte(deps.config, sessionCtx.session.alias());
    const fin = deps.clock.now();
    const enveloppeBrute = construireEnveloppeContexte(null, resultat, {
      mode: options.mode,
      observeA: fin.toISOString(),
      dureeMs: fin.getTime() - debut.getTime(),
      appelsApi: 0,
      appelsAuth: 0,
      quotaJourRestant: null,
      quotaUtilisable: null,
      quotaEstime: null,
    });
    const enveloppeMasquee = appliquerPolitiqueSortie(enveloppeBrute, options.politique);
    return finaliserEtSerialiser(enveloppeMasquee, ListerDossiersContexteSchema, URI_DOSSIERS);
  }
  if (analyse.type === "glossaire") {
    const fin = deps.clock.now();
    const enveloppeBrute = enveloppeGlossaire(options.mode, debut, fin);
    const enveloppeMasquee = appliquerPolitiqueSortie(enveloppeBrute, options.politique);
    return finaliserEtSerialiser(enveloppeMasquee, TermeGlossaireSchema, URI_GLOSSAIRE);
  }
  return lireRessourceDossier(deps, options, debut, analyse.alias, analyse.suffixe);
}

/** `resources/read` (D-T12-13) : erreur JSON-RPC dont `data = {erreur}` passe la politique PII. */
export async function lireRessource(
  deps: DepsProcessus,
  sessionCtx: SessionMcp,
  options: OptionsExecution,
  uri: string,
): Promise<{ readonly uri: string; readonly mimeType: string; readonly text: string }> {
  const debut = deps.clock.now();
  const requeteId = idRequeteCourt();
  try {
    const texte = await resoudreEtLireRessource(deps, sessionCtx, options, uri, debut);
    return { uri, mimeType: "application/json", text: texte };
  } catch (erreur) {
    try {
      deps.journal.erreur(entreeJournalErreur(`resource:${uri}`, requeteId, erreur));
    } catch {
      // La journalisation ne doit jamais faire échouer la réponse d'erreur (D-T12-4).
    }
    const erreurMetier = versErreurMetier(erreur, options.politique);
    throw new McpError(codeJsonRpcPourErreur(erreurMetier.code), erreurMetier.message, { erreur: erreurMetier });
  }
}
