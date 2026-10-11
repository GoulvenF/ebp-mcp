/**
 * Transport HTTP mock (T13-1) : implémente `HttpTransport` sans AUCUNE émission réseau externe —
 * jamais d'import de `src/http/transport-fetch.ts`, jamais d'appel à `fetch` vers EBP. Répond
 * depuis un jeu de données synthétique (`src/mock/donnees/`) pour les origines métier fixes
 * (`src/http/origines.ts`) et délègue `POST /connect/token` sur l'hôte identité (`src/auth/
 * origines.ts`) à l'identité simulée (`src/mock/identite.ts`). Toute autre origine, méthode ou
 * route lève une erreur JavaScript explicite, jamais une réponse HTTP simulée.
 */
import { CHEMIN_TOKEN, estOrigineIdentiteAutorisee } from "../auth/origines.js";
import { origineMetier } from "../http/origines.js";
import { REGISTRE_ROUTES, segmentsDuGabarit, type EntreeRegistre } from "../http/registre.js";
import type { HttpRequestSpec, HttpResponseSpec, HttpTransport } from "../ports/http-transport.js";
import type { IdentiteMock } from "./identite.js";

/** Message exact exigé par la fiche T13-1 pour tout refus d'origine/méthode/route en mode mock. */
export const MESSAGE_ORIGINE_REFUSEE = "origine refusée en mode mock";

export interface JeuCpt {
  readonly tenantId: string;
  /** Fiches sans wrapper, sans segment de route (ex. `/domain-information`, `/folder-settings`). */
  readonly fiches: Readonly<Record<string, unknown>>;
  /** Listes, clé = identifiant de route du registre (`src/http/registre.ts`). */
  readonly listes: Readonly<Record<string, readonly unknown[]>>;
  /** Fiches de détail, clé = identifiant de route, puis clé = valeur du segment (numéro/uuid/code). */
  readonly details: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
}

export interface JeuGc {
  readonly domainId: string;
  readonly listes: Readonly<Record<string, readonly unknown[]>>;
  readonly details: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
}

export interface JeuMock {
  readonly cpt: JeuCpt;
  readonly gc: JeuGc;
}

export interface OptionsTransportMock {
  readonly identite?: IdentiteMock;
}

type FormeEnveloppe =
  | { readonly type: "fiche" }
  | { readonly type: "detail" }
  | { readonly type: "liste"; readonly wrapper: "data" | "elements" | "linesEntries"; readonly champTotal?: "totalRecords" | "total" }
  | { readonly type: "tableau_nu" };

/** Forme d'enveloppe par route (02 §2/§3, `tests/corpus/ebp/*.json`), reproduite ici pour le mock. */
const FORMES_ENVELOPPE: Readonly<Record<string, FormeEnveloppe>> = {
  "cpt-domain-information": { type: "fiche" },
  "cpt-folder-settings": { type: "fiche" },
  "cpt-auxiliary-account-types": { type: "liste", wrapper: "data" },
  "cpt-auxiliary-accounts": { type: "liste", wrapper: "data", champTotal: "totalRecords" },
  "cpt-auxiliary-account-detail": { type: "detail" },
  "cpt-general-account": { type: "liste", wrapper: "data" },
  "cpt-general-account-detail": { type: "detail" },
  "cpt-journals": { type: "liste", wrapper: "data" },
  "cpt-journal-detail": { type: "detail" },
  "cpt-lines-entries": { type: "liste", wrapper: "linesEntries" },
  "cpt-entry-detail": { type: "detail" },
  "cpt-search-entries": { type: "tableau_nu" },
  "cpt-bank-transactions": { type: "liste", wrapper: "data", champTotal: "totalRecords" },
  "cpt-vat-rate": { type: "liste", wrapper: "data" },
  "gc-customer-detail": { type: "detail" },
  "gc-items": { type: "liste", wrapper: "elements", champTotal: "total" },
  "gc-item-good-detail": { type: "detail" },
  "gc-item-service-detail": { type: "detail" },
  "gc-sale-documents": { type: "liste", wrapper: "elements", champTotal: "total" },
  "gc-sale-invoice-detail": { type: "detail" },
  "gc-sale-invoice-validated-detail": { type: "detail" },
  "gc-sale-credit-detail": { type: "detail" },
  "gc-sale-credit-validated-detail": { type: "detail" },
  "gc-sale-quote-detail": { type: "detail" },
  "gc-sale-quote-invoiced-detail": { type: "detail" },
  "gc-sale-deposit-invoice-detail": { type: "detail" },
  "gc-sale-deposit-credit-detail": { type: "detail" },
  "gc-sale-commitments": { type: "liste", wrapper: "elements", champTotal: "total" },
  "gc-settlements": { type: "liste", wrapper: "elements", champTotal: "total" },
  "gc-vat-rates": { type: "tableau_nu" },
};

function echapperRegex(texte: string): string {
  return texte.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function gabaritEnRegex(route: EntreeRegistre): RegExp {
  const chemin = `${route.prefixe}${route.chemin}`;
  const echappe = echapperRegex(chemin).replace(/\\\{[^}]+\\\}/g, "([^/]+)");
  return new RegExp(`^${echappe}$`);
}

interface RouteTrouvee {
  readonly route: EntreeRegistre;
  readonly segments: Readonly<Record<string, string>>;
}

function trouverRouteParChemin(pathname: string): RouteTrouvee | undefined {
  for (const route of REGISTRE_ROUTES) {
    const correspondance = gabaritEnRegex(route).exec(pathname);
    if (correspondance === null) continue;
    const noms = segmentsDuGabarit(route.chemin);
    const segments: Record<string, string> = {};
    noms.forEach((nom, index) => {
      segments[nom] = decodeURIComponent(correspondance[index + 1] as string);
    });
    return { route, segments };
  }
  return undefined;
}

function reponseJson(status: number, corps: unknown): HttpResponseSpec {
  return { status, headers: { "content-type": "application/json" }, body: JSON.stringify(corps) };
}

function erreurEbp404(): HttpResponseSpec {
  return reponseJson(404, { status: 404, errorCode: "NotFound", message: "Ressource introuvable (mock)." });
}

function erreurEbp401(): HttpResponseSpec {
  return reponseJson(401, { status: 401, errorCode: "Auth.InvalidToken", message: "JWT invalide ou expiré (mock)." });
}

const PREFIXE_ACCESS_TOKEN = "mock-at-";

function tokenValide(headers: Readonly<Record<string, string>>): boolean {
  const entete = headers["Authorization"] ?? headers["authorization"];
  if (entete === undefined) return false;
  const prefixe = "Bearer ";
  if (!entete.startsWith(prefixe)) return false;
  return entete.slice(prefixe.length).startsWith(PREFIXE_ACCESS_TOKEN);
}

function construireReponseListe(
  forme: Extract<FormeEnveloppe, { type: "liste" }>,
  elements: readonly unknown[],
  skip: number,
  take: number,
): HttpResponseSpec {
  const page = elements.slice(skip, skip + take);
  const corps: Record<string, unknown> = { [forme.wrapper]: page, take, skip };
  if (forme.champTotal !== undefined) {
    corps[forme.champTotal] = elements.length;
  }
  return reponseJson(200, corps);
}

function repondreRouteMetier(jeu: JeuMock, trouvee: RouteTrouvee, url: URL, headers: Readonly<Record<string, string>>): HttpResponseSpec {
  const { route, segments } = trouvee;
  if (!tokenValide(headers)) {
    return erreurEbp401();
  }

  if (route.famille === "hubbix-compta") {
    if ((headers["tenantid"] ?? headers["TenantId"]) !== jeu.cpt.tenantId) {
      return erreurEbp404();
    }
  } else {
    if ((headers["DomainId"] ?? headers["domainid"]) !== jeu.gc.domainId) {
      return erreurEbp404();
    }
  }

  const forme = FORMES_ENVELOPPE[route.id];
  if (forme === undefined) {
    throw new Error(MESSAGE_ORIGINE_REFUSEE);
  }

  if (forme.type === "fiche") {
    const fiche = jeu.cpt.fiches[route.id];
    if (fiche === undefined) return erreurEbp404();
    return reponseJson(200, fiche);
  }

  if (forme.type === "detail") {
    const nomSegment = route.segments[0];
    const valeurSegment = nomSegment !== undefined ? segments[nomSegment] : undefined;
    if (valeurSegment === undefined) return erreurEbp404();
    const details = route.famille === "hubbix-compta" ? jeu.cpt.details : jeu.gc.details;
    const fiche = details[route.id]?.[valeurSegment];
    if (fiche === undefined) return erreurEbp404();
    return reponseJson(200, fiche);
  }

  if (forme.type === "tableau_nu") {
    const listes = route.famille === "hubbix-compta" ? jeu.cpt.listes : jeu.gc.listes;
    const elements = listes[route.id] ?? [];
    return reponseJson(200, elements);
  }

  // forme.type === "liste"
  const listes = route.famille === "hubbix-compta" ? jeu.cpt.listes : jeu.gc.listes;
  const elements = listes[route.id] ?? [];
  const skip = Number.parseInt(url.searchParams.get("skip") ?? "0", 10);
  const take = Number.parseInt(url.searchParams.get("take") ?? "50", 10);
  return construireReponseListe(forme, elements, Number.isNaN(skip) ? 0 : skip, Number.isNaN(take) ? 50 : take);
}

/**
 * `creerTransportMock` (T13-1) : aucun passthrough réseau, jamais d'import de `transport-fetch`.
 * N'accepte que les origines métier fixes (`origineMetier("prod"|"preprod")`) et l'hôte identité
 * (`HOTE_IDENTITE`). `/connect/authorize` n'est jamais appelé via `HttpTransport` (le consentement
 * simulé y accède directement, hors de ce transport) ; seul `POST /connect/token` y est délégué à
 * `options.identite`.
 */
export function creerTransportMock(jeu: JeuMock, options: OptionsTransportMock = {}): HttpTransport {
  return {
    async request(spec: HttpRequestSpec): Promise<HttpResponseSpec> {
      let url: URL;
      try {
        url = new URL(spec.url);
      } catch {
        throw new Error(MESSAGE_ORIGINE_REFUSEE);
      }

      if (estOrigineIdentiteAutorisee(spec.url)) {
        if (spec.method === "POST" && url.pathname === CHEMIN_TOKEN) {
          if (options.identite === undefined) {
            throw new Error(MESSAGE_ORIGINE_REFUSEE);
          }
          return options.identite.traiterRequeteToken(spec.body ?? "");
        }
        throw new Error(MESSAGE_ORIGINE_REFUSEE);
      }

      const origine = `${url.protocol}//${url.host}`;
      if (origine !== origineMetier("prod") && origine !== origineMetier("preprod")) {
        throw new Error(MESSAGE_ORIGINE_REFUSEE);
      }

      if (spec.method !== "GET") {
        throw new Error(MESSAGE_ORIGINE_REFUSEE);
      }

      const trouvee = trouverRouteParChemin(url.pathname);
      if (trouvee === undefined) {
        throw new Error(MESSAGE_ORIGINE_REFUSEE);
      }

      return repondreRouteMetier(jeu, trouvee, url, spec.headers ?? {});
    },
  };
}
