import type { OutilMetier } from "../../services/commun/capacites.js";
import { validerEntree } from "../../services/commun/entrees.js";
import type { ContexteService, DepsService } from "../../services/commun/types.js";
import { capturerContexteDossier } from "../../config/session.js";
import type { ContexteHttp } from "../../http/client.js";
import { idRequeteCourt } from "../../http/journal-http.js";
import type { ExecutionContext } from "../../ports/execution-context.js";
import { enveloppeSchema } from "../../domain/schemas/commun.js";
import {
  appliquerPolitiqueSortie,
  construireEnveloppe,
  entreeJournalErreur,
  erreurPiiBrutRefuse,
  serialiserErreur,
  serialiserSucces,
  verifierPlafondFiche,
  verifierPlafondFinal,
  versErreurMetier,
  type ReponseOutil,
} from "../sortie/index.js";
import { BUDGET_TENTATIVES_OUTIL, DEADLINE_OUTIL_MS } from "./constantes.js";
import { REGISTRE_SERVICES, SCHEMAS_ENTREE_OUTILS, SCHEMAS_SORTIE_OUTILS } from "./registre.js";
import type { DepsProcessus, OptionsExecution, SessionMcp } from "./types.js";
import { creerCompteursAppel, envelopperHookToken, envelopperTransport } from "./wrappers.js";
import { PLAFOND_SORTIE_OCTETS } from "../sortie/plafonds.js";

const SIGNAL_JAMAIS_ANNULE = new AbortController().signal;

async function lireIdentiteGenerationLocale(deps: DepsProcessus): Promise<number> {
  const store = deps.config.identiteStore;
  const enregistrement = await deps.tokenStore.read({
    profil: store.profil,
    environnement: store.environnement,
    empreinteClientId: store.empreinteClient,
  });
  return enregistrement?.generation ?? 0;
}

/**
 * `executerOutilMetier` (D-T12-3, 07 §4) : déroule le pipeline complet d'un appel d'outil
 * métier — de l'entrée brute reçue jusqu'à l'objet MCP final, prêt à renvoyer tel quel. Ne laisse
 * remonter aucune exception : toute erreur, connue ou non, devient une `ReponseOutilErreur`
 * (D-T12-4). `src/mcp/` n'appelle ici qu'**un** service du registre (D-T12-1).
 */
export async function executerOutilMetier(
  deps: DepsProcessus,
  sessionCtx: SessionMcp,
  outil: OutilMetier,
  argsBrut: unknown,
  options: OptionsExecution,
): Promise<ReponseOutil> {
  const debut = deps.clock.now();
  const requeteId = idRequeteCourt();
  try {
    // 1. Validation d'entrée (Zod strict) : 0 appel transport avant cette étape ni après un refus.
    const entree = validerEntree(SCHEMAS_ENTREE_OUTILS[outil], argsBrut, outil) as { dossier?: string; inclure_brut: boolean };

    // 2. Mode PII et `inclure_brut: true` : refusé avant le cache et le réseau (D-T12-3/D-T12-7).
    if (options.politique.redactPii && entree.inclure_brut) {
      throw erreurPiiBrutRefuse(outil);
    }

    // 3. Capture du dossier (argument > session > défaut) ; `exigerFamilleActive` est appliqué à
    // l'intérieur de `resoudreDossier` (D-T12-3, étape 4) : jamais un second appel ici.
    const contexteDossier = capturerContexteDossier(
      deps.config,
      sessionCtx.session,
      entree.dossier !== undefined ? { dossier: entree.dossier } : {},
    );

    // 5. `ExecutionContext` : budget et deadline fixes, génération lue localement, signal de l'appel.
    const executionContext: ExecutionContext = {
      profil: deps.config.profil,
      environnement: deps.config.environnement,
      identiteGeneration: await lireIdentiteGenerationLocale(deps),
      dossier: contexteDossier.dossier.id,
      budgetRestant: BUDGET_TENTATIVES_OUTIL,
      deadline: new Date(debut.getTime() + DEADLINE_OUTIL_MS),
      signal: options.signal ?? SIGNAL_JAMAIS_ANNULE,
    };

    // 6. `ContexteHttp` depuis l'abonnement de la famille du dossier résolu.
    const abonnement = deps.config.abonnementPourFamille(contexteDossier.dossier.famille);
    const contexteHttp: ContexteHttp = {
      environnement: deps.config.environnement,
      famille: contexteDossier.dossier.famille,
      dossierId: contexteDossier.dossier.id,
      subscriptionKey: abonnement.cle,
      groupeQuota: abonnement.groupeQuota,
    };

    // Wrappers par appel (D-T12-6) : comptent les départs de transport et les tentatives auth.
    const compteurs = creerCompteursAppel();
    const depsService: DepsService = {
      http: {
        ...deps.http,
        transport: envelopperTransport(deps.http.transport, compteurs),
        hookToken: envelopperHookToken(deps.http.hookToken, compteurs),
      },
      scan: { ...deps.scan, plafondOctetsResultats: PLAFOND_SORTIE_OCTETS },
      clock: deps.clock,
    };
    const ctxService: ContexteService = {
      execution: executionContext,
      http: contexteHttp,
      dossier: contexteDossier.dossier,
    };

    // 7. Appel du **seul** service du registre correspondant à cet outil.
    const service = REGISTRE_SERVICES[outil];
    const resultatService = await service(depsService, ctxService, entree);

    // `meta.quota_*` lu après le service (D-T12-6) : `null` et avertissement si la lecture échoue.
    let quotaJourRestant: number | null = null;
    let quotaUtilisable: number | null = null;
    let quotaEstime: boolean | null = null;
    const avertissementsSupplementaires: string[] = [];
    try {
      const statut = await deps.http.quota.getStatut(contexteHttp.groupeQuota);
      quotaJourRestant = statut.quotaJourRestant;
      quotaUtilisable = statut.quotaUtilisable;
      quotaEstime = statut.quotaEstime;
    } catch {
      avertissementsSupplementaires.push("Lecture du quota impossible : `quota_*` à `null`.");
    }

    const fin = deps.clock.now();
    const enveloppeBrute = construireEnveloppe(resultatService, {
      mode: options.mode,
      observeA: fin.toISOString(),
      dureeMs: fin.getTime() - debut.getTime(),
      appelsApi: compteurs.appelsApi,
      appelsAuth: compteurs.appelsAuth,
      quotaJourRestant,
      quotaUtilisable,
      quotaEstime,
      avertissementsSupplementaires,
    });

    // 8. Politique de sortie, puis validation du schéma de sortie, puis plafonds, puis sérialisation.
    const enveloppeMasquee = appliquerPolitiqueSortie(enveloppeBrute, options.politique);
    const schemaSortie = enveloppeSchema(SCHEMAS_SORTIE_OUTILS[outil]);
    const parse = schemaSortie.safeParse(enveloppeMasquee);
    if (!parse.success) {
      throw new Error(`Enveloppe de sortie invalide pour \`${outil}\` (schéma de sortie non respecté).`);
    }
    const enveloppeValidee = parse.data as typeof enveloppeBrute;
    verifierPlafondFiche(enveloppeValidee);
    const enveloppeFinale = verifierPlafondFinal(enveloppeValidee);

    return serialiserSucces(enveloppeFinale);
  } catch (erreur) {
    try {
      deps.journal.erreur(entreeJournalErreur(outil, requeteId, erreur));
    } catch {
      // La journalisation ne doit jamais faire échouer la réponse d'erreur (D-T12-4).
    }
    return serialiserErreur(versErreurMetier(erreur, options.politique));
  }
}
