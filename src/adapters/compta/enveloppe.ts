import { erreurEnveloppeInattendueCompta } from "./errors.js";

/**
 * Lecture de la forme source `{data:[...], totalRecords?}` (02 §2, D-T09-7). `totalRecords` n'est
 * documenté que pour les listes paginées (`/auxiliary-accounts`) ; les référentiels sans
 * pagination documentée (`/journals`, `/general-account`, `/vat-rate`, `/auxiliary-account-types`)
 * n'en portent pas — `totalSource` vaut alors `null`, jamais un total inventé. Une forme sans clé
 * `data` tableau (p. ex. `{linesEntries:[...]}` ou un tableau nu) ⇒ `UPSTREAM_SCHEMA_CHANGED`,
 * jamais une relecture sous cette autre forme.
 */
export interface EnveloppeDataLue {
  readonly elements: unknown[];
  readonly totalSource: number | null;
}

export function lireEnveloppeData(routeId: string, corps: unknown): EnveloppeDataLue {
  if (typeof corps !== "object" || corps === null || Array.isArray(corps)) {
    throw erreurEnveloppeInattendueCompta(routeId);
  }
  const objet = corps as Record<string, unknown>;
  if (!Array.isArray(objet.data)) {
    throw erreurEnveloppeInattendueCompta(routeId);
  }
  const totalSource = typeof objet.totalRecords === "number" ? objet.totalRecords : null;
  return { elements: objet.data, totalSource };
}

/**
 * Lecture de la forme source `{linesEntries:[...]}` (`/lines-entries`, 02 §2, D-T09-7). Un corps
 * `{data:[...]}` n'est jamais lu ici comme `{linesEntries:[...]}` : la clé `linesEntries` doit être
 * un tableau, sinon `UPSTREAM_SCHEMA_CHANGED`.
 */
export function lireEnveloppeLinesEntries(routeId: string, corps: unknown): unknown[] {
  if (typeof corps !== "object" || corps === null || Array.isArray(corps)) {
    throw erreurEnveloppeInattendueCompta(routeId);
  }
  const objet = corps as Record<string, unknown>;
  if (!Array.isArray(objet.linesEntries)) {
    throw erreurEnveloppeInattendueCompta(routeId);
  }
  return objet.linesEntries;
}

/**
 * Lecture du tableau nu (`/search-entries/entries`, 02 §2, D-T09-7). Un corps objet (`{data:…}`
 * ou `{linesEntries:…}`) n'est jamais lu ici comme un tableau nu ⇒ `UPSTREAM_SCHEMA_CHANGED`.
 */
export function lireEnveloppeTableauNuCompta(routeId: string, corps: unknown): unknown[] {
  if (!Array.isArray(corps)) {
    throw erreurEnveloppeInattendueCompta(routeId);
  }
  return corps;
}

/**
 * Lecture d'une fiche (objet nu, pas d'enveloppe de liste) : `/domain-information`,
 * `/folder-settings`, `/auxiliary-accounts/{number}`, `/general-account/{number}`,
 * `/journals/{code}`, `/entries/{uuid}` (02 §2). Tout statut HTTP non-200 est déjà converti en
 * erreur stable par le client (`src/http/client.ts`) avant que ce code ne lise un corps — seule
 * une réponse 200 de forme inattendue (tableau, scalaire) passe par cette fonction.
 */
export function lireFicheCompta(routeId: string, corps: unknown): Record<string, unknown> {
  if (typeof corps !== "object" || corps === null || Array.isArray(corps)) {
    throw erreurEnveloppeInattendueCompta(routeId);
  }
  return corps as Record<string, unknown>;
}
