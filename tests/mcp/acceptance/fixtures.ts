// Fixtures communes aux scénarios transverses de recette MCP (fiche T14, GOU-381) : porte au
// niveau `tools/call` réel (`@modelcontextprotocol/sdk` `Client` sur `InMemoryTransport`) des
// scénarios aujourd'hui testés seulement au niveau moteur. Réutilise la pile RÉELLE mock-first de
// `tests/mock/fixtures.ts` (`construirePileMock` : config résolue, stockage fichier, verrous,
// quota fichier, hook token/cycle d'auth T06 complet) et substitue ensuite, pour les seuls appels
// métier, un transport personnalisé à `depsPartage.http.transport` — après un login T06 complet,
// le token est frais, `hookToken` ne rafraîchit donc rien pendant le test et son transport
// d'origine (capturé à sa construction) n'est jamais sollicité. Ce remplacement reste cohérent
// avec D-T12-14 (« toutes les dépendances sont injectées ») : aucun autre composant de la pile
// n'est doublé.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  creerFabriqueServeur,
  DATE_REFERENCE_DEMO,
  JEU_CPT_DEMO,
  JEU_GC_DEMO,
  TENANT_ID_DEMO_CPT,
  DOMAIN_ID_DEMO_GC,
} from "../../../dist/index.js";
import type { DepsProcessusPartage, HttpRequestSpec, HttpResponseSpec, HttpTransport, JeuMock, JournalMcp } from "../../../dist/index.js";
import { portLibre } from "../../auth/fixtures.js";
import {
  construirePileMock,
  creerHorlogeControlee,
  creerRepertoireTemporaireMock,
  nettoyerRepertoireMock,
  type PileMock,
} from "../../mock/fixtures.js";

export const JEU: JeuMock = { cpt: JEU_CPT_DEMO, gc: JEU_GC_DEMO };
export const DOSSIER_CPT = "demo-cpt";
export const DOSSIER_GC = "demo-gc";
export { TENANT_ID_DEMO_CPT, DOMAIN_ID_DEMO_GC, DATE_REFERENCE_DEMO };
export { portLibre, creerHorlogeControlee, creerRepertoireTemporaireMock, nettoyerRepertoireMock };

export interface ContexteClientPersonnalise {
  readonly racine: string;
  readonly pile: PileMock;
  readonly client: Client;
  fermer(): Promise<void>;
}

export interface OptionsClientPersonnalise {
  /** Remplace `depsPartage.http.transport` pour les appels métier, après un login T06 complet. */
  readonly transport?: HttpTransport;
  /** Remplace `depsPartage.journal` (capture des entrées au lieu de stderr). */
  readonly journal?: JournalMcp;
}

/**
 * Démarre une pile mock réelle (login T06 complet), puis connecte un client SDK réel à un serveur
 * dont les dépendances partagées ont été recomposées avec les overrides fournis (transport et/ou
 * journal). `pile.depsPartage` original reste inchangé ; seule la copie passée à
 * `creerFabriqueServeur` porte les overrides.
 */
export async function demarrerClientPersonnalise(
  options: OptionsClientPersonnalise = {},
): Promise<ContexteClientPersonnalise> {
  const racine = await creerRepertoireTemporaireMock();
  const port = await portLibre();
  const clock = creerHorlogeControlee(DATE_REFERENCE_DEMO);
  const pile = await construirePileMock(racine, clock, JEU, `http://127.0.0.1:${port}/callback`);
  await pile.connecter();

  const depsPersonnalise: DepsProcessusPartage = {
    ...pile.depsPartage,
    http: { ...pile.depsPartage.http, ...(options.transport !== undefined ? { transport: options.transport } : {}) },
    ...(options.journal !== undefined ? { journal: options.journal } : {}),
  };

  const fabrique = creerFabriqueServeur(depsPersonnalise, { mode: "mock" });
  const serveur = fabrique();
  const [transportServeur, transportClient] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-acceptance-mcp", version: "0.0.0" });
  await Promise.all([serveur.connect(transportServeur), client.connect(transportClient)]);

  return {
    racine,
    pile,
    client,
    async fermer(): Promise<void> {
      await client.close();
      await nettoyerRepertoireMock(racine);
    },
  };
}

function reponseJson(status: number, corps: unknown): HttpResponseSpec {
  return { status, headers: { "content-type": "application/json" }, body: JSON.stringify(corps) };
}

/** Transport personnalisé générique : délègue chaque requête à un gestionnaire, compte les appels. */
export function creerTransportPersonnalise(
  gestionnaire: (spec: HttpRequestSpec, appel: number) => HttpResponseSpec | Promise<HttpResponseSpec>,
): HttpTransport & { readonly appels: HttpRequestSpec[] } {
  const appels: HttpRequestSpec[] = [];
  return {
    appels,
    async request(spec: HttpRequestSpec): Promise<HttpResponseSpec> {
      appels.push(spec);
      return gestionnaire(spec, appels.length);
    },
  };
}

/** Transport qui échoue bruyamment si sollicité (scénarios « 0 appel réseau attendu »). */
export function creerTransportInterdit(): HttpTransport & { readonly appels: HttpRequestSpec[] } {
  return creerTransportPersonnalise((spec) => {
    throw new Error(`Transport interdit sollicité : ${spec.method} ${spec.url}`);
  });
}

export { reponseJson };
