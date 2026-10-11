import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  type ServerResult,
} from "@modelcontextprotocol/sdk/types.js";
import { creerSession } from "../../config/session.js";
import { MagasinCurseurs } from "../../pagination/curseurs.js";
import { VERSION } from "../../version.js";
import type { DepsProcessus, OptionsExecution, SessionMcp } from "../execution/types.js";
import { gestionnaireAppelOutil } from "./gestionnaire.js";
import { construireListeOutils } from "./outils.js";
import { construireListeGabarits, construireListeRessources, lireRessource } from "./ressources.js";
import type { DepsProcessusPartage, FabriqueServeur, OptionsServeur } from "./types.js";

const NOM_SERVEUR = "ebp-mcp";

function construireOptionsExecution(
  depsPartage: DepsProcessusPartage,
  options: OptionsServeur,
  signal: AbortSignal,
): OptionsExecution {
  return { mode: options.mode, politique: { redactPii: depsPartage.config.redactPii }, signal };
}

/**
 * Un `Server` bas niveau (D-T12-2) par session MCP (D-T12-10) : `Session` et `MagasinCurseurs`
 * dédiés, le reste des dépendances est partagé par le processus. Capacités `tools`/`resources`
 * seulement : ni `prompts`, ni `listChanged` (D-T12-2).
 */
function construireServeur(depsPartage: DepsProcessusPartage, options: OptionsServeur): Server {
  const sessionCtx: SessionMcp = {
    session: creerSession({ dossiers: depsPartage.config.dossiers, environnement: depsPartage.config.environnement }),
    curseurs: new MagasinCurseurs(depsPartage.clock),
  };
  const deps: DepsProcessus = {
    config: depsPartage.config,
    http: depsPartage.http,
    scan: { curseurs: sessionCtx.curseurs, cache: depsPartage.cache, clock: depsPartage.clock },
    clock: depsPartage.clock,
    tokenStore: depsPartage.tokenStore,
    journal: depsPartage.journal,
    claims: depsPartage.claims ?? null,
  };

  const server = new Server({ name: NOM_SERVEUR, version: VERSION }, { capabilities: { tools: {}, resources: {} } });

  server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: construireListeOutils() }));

  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const optionsExecution = construireOptionsExecution(depsPartage, options, extra.signal);
    const reponse = await gestionnaireAppelOutil(
      deps,
      sessionCtx,
      optionsExecution,
      request.params.name,
      request.params.arguments ?? {},
    );
    return reponse as ServerResult;
  });

  server.setRequestHandler(ListResourcesRequestSchema, () => ({ resources: construireListeRessources(depsPartage.config) }));

  server.setRequestHandler(ListResourceTemplatesRequestSchema, () => ({ resourceTemplates: construireListeGabarits() }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request, extra) => {
    const optionsExecution = construireOptionsExecution(depsPartage, options, extra.signal);
    const contenu = await lireRessource(deps, sessionCtx, optionsExecution, request.params.uri);
    return { contents: [contenu] };
  });

  return server;
}

/**
 * `creerFabriqueServeur` (D-T12-10/D-T12-14) : `options.mode` est obligatoire, sans défaut ni
 * déduction depuis le transport. Chaque appel de la fabrique rendue crée un nouveau `Server` avec
 * sa propre session (deux sessions ne partagent ni dossier actif ni curseurs).
 */
export function creerFabriqueServeur(depsPartage: DepsProcessusPartage, options: OptionsServeur): FabriqueServeur {
  return () => construireServeur(depsPartage, options);
}

/**
 * `demarrerStdio` (D-T12-14) : connecte un `StdioServerTransport` à un `Server` neuf de la
 * fabrique. Rien n'écrit sur stdout hors du protocole MCP (les journaux vont sur stderr).
 */
export async function demarrerStdio(fabrique: FabriqueServeur): Promise<Server> {
  const serveur = fabrique();
  const transport = new StdioServerTransport();
  await serveur.connect(transport);
  return serveur;
}
