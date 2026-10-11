import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { validerEntree } from "../../services/commun/entrees.js";
import { choisirDossierContexte } from "../../services/contexte/choisir-dossier.js";
import { listerDossiersContexte } from "../../services/contexte/lister-dossiers.js";
import {
  ChoisirDossierContexteSchema,
  ListerDossiersContexteSchema,
  StatutContexteSchema,
} from "../../services/contexte/schemas.js";
import { statutContexte } from "../../services/contexte/statut.js";
import { enveloppeSchema } from "../../domain/schemas/commun.js";
import type { z } from "zod";
import { executerOutilMetier } from "../execution/pipeline.js";
import type { DepsProcessus, OptionsExecution, SessionMcp } from "../execution/types.js";
import {
  appliquerPolitiqueSortie,
  construireEnveloppeContexte,
  entreeJournalErreur,
  serialiserErreur,
  serialiserSucces,
  verifierPlafondFiche,
  verifierPlafondFinal,
  versErreurMetier,
  type ReponseOutil,
} from "../sortie/index.js";
import { idRequeteCourt } from "../../http/journal-http.js";
import { EntreeVideSchema, estOutilContexte, estOutilMetier, type OutilContexte } from "./outils.js";

const SCHEMAS_SORTIE_CONTEXTE: Record<OutilContexte, z.ZodType> = {
  ebp_lister_dossiers: ListerDossiersContexteSchema,
  ebp_choisir_dossier: ChoisirDossierContexteSchema,
  ebp_statut: StatutContexteSchema,
};

/**
 * `ebp_lister_dossiers`/`ebp_choisir_dossier`/`ebp_statut` (D-T12-11) : 0 réseau, même forme
 * d'enveloppe que les 14 outils métier (`dossier: null`, `pagination: null`, quota `null`), mais
 * sans `ExecutionContext` ni `ContexteHttp` puisqu'aucun service n'est appelé via le registre.
 */
async function executerOutilContexte(
  deps: DepsProcessus,
  sessionCtx: SessionMcp,
  options: OptionsExecution,
  nom: OutilContexte,
  argsBrut: unknown,
): Promise<ReponseOutil> {
  const debut = deps.clock.now();
  const requeteId = idRequeteCourt();
  try {
    let resultat: unknown;
    if (nom === "ebp_lister_dossiers") {
      validerEntree(EntreeVideSchema, argsBrut, nom);
      resultat = listerDossiersContexte(deps.config, sessionCtx.session.alias());
    } else if (nom === "ebp_choisir_dossier") {
      resultat = choisirDossierContexte(deps.config, sessionCtx.session, argsBrut);
    } else {
      validerEntree(EntreeVideSchema, argsBrut, nom);
      resultat = await statutContexte(
        { tokenStore: deps.tokenStore, quotaStore: deps.http.quota, claims: deps.claims ?? null },
        deps.config,
        options.mode,
        sessionCtx.session.alias(),
      );
    }

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
    const schemaEnveloppe = enveloppeSchema(SCHEMAS_SORTIE_CONTEXTE[nom]);
    const parse = schemaEnveloppe.safeParse(enveloppeMasquee);
    if (!parse.success) {
      throw new Error(`Enveloppe de sortie invalide pour \`${nom}\` (schéma de sortie non respecté).`);
    }
    const enveloppeValidee = parse.data as typeof enveloppeBrute;
    verifierPlafondFiche(enveloppeValidee);
    const enveloppeFinale = verifierPlafondFinal(enveloppeValidee);
    return serialiserSucces(enveloppeFinale);
  } catch (erreur) {
    try {
      deps.journal.erreur(entreeJournalErreur(nom, requeteId, erreur));
    } catch {
      // La journalisation ne doit jamais faire échouer la réponse d'erreur (D-T12-4).
    }
    return serialiserErreur(versErreurMetier(erreur, options.politique));
  }
}

/**
 * `tools/call` (D-T12-1) : route vers `executerOutilMetier` (lot 1, 14 outils) ou vers les 3
 * outils de contexte (lot 2 pour les données). Un nom inconnu est une erreur JSON-RPC
 * protocolaire (D-T12-4), jamais `isError: true`.
 */
export async function gestionnaireAppelOutil(
  deps: DepsProcessus,
  sessionCtx: SessionMcp,
  options: OptionsExecution,
  nom: string,
  argsBrut: unknown,
): Promise<ReponseOutil> {
  if (estOutilMetier(nom)) {
    return executerOutilMetier(deps, sessionCtx, nom, argsBrut, options);
  }
  if (estOutilContexte(nom)) {
    return executerOutilContexte(deps, sessionCtx, options, nom, argsBrut);
  }
  throw new McpError(ErrorCode.InvalidParams, `Outil inconnu : \`${nom}\`.`);
}
