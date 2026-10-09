import { erreurEnveloppeInattendue } from "./errors.js";

/**
 * Lecture de la forme source `{take, skip, total, elements[]}` (02 §3) d'une route de liste.
 * Renvoie les compteurs source tels que fournis : `totalSource` (`total` EBP, non filtré),
 * `skipDemande` (paramètre envoyé par l'appelant) et `skipRenvoye` (`skip` renvoyé par EBP, à
 * comparer par l'appelant — la détection d'incohérence n'est pas faite ici). Forme inattendue
 * (clé manquante, type différent) ⇒ `UPSTREAM_SCHEMA_CHANGED`, jamais un total ou une page
 * inventée.
 */
export interface EnveloppeListeLue {
  readonly elements: unknown[];
  readonly totalSource: number | null;
  readonly skipDemande: number;
  readonly skipRenvoye: number;
}

export function lireEnveloppeListe(routeId: string, corps: unknown, skipDemande: number): EnveloppeListeLue {
  if (typeof corps !== "object" || corps === null || Array.isArray(corps)) {
    throw erreurEnveloppeInattendue(routeId);
  }
  const objet = corps as Record<string, unknown>;
  if (!Array.isArray(objet.elements) || typeof objet.total !== "number" || typeof objet.skip !== "number") {
    throw erreurEnveloppeInattendue(routeId);
  }
  return { elements: objet.elements, totalSource: objet.total, skipDemande, skipRenvoye: objet.skip };
}

/**
 * Lecture du tableau nu (`/vat-rates`, 02 §3) : aucun wrapper, résultat d'agrégat complet en un
 * seul appel. Forme inattendue (corps non-tableau) ⇒ `UPSTREAM_SCHEMA_CHANGED`.
 */
export function lireEnveloppeTableauNu(routeId: string, corps: unknown): unknown[] {
  if (!Array.isArray(corps)) {
    throw erreurEnveloppeInattendue(routeId);
  }
  return corps;
}

/**
 * Lecture d'une fiche (objet nu, pas d'enveloppe de liste) : `/customers/{id}`,
 * `/items/goods/{id}`, `/items/services/{id}` (02 §3). L'erreur Hubbix GC
 * `{status, errorCode, message, data?}` n'est jamais observée ici : tout statut HTTP non-200 est
 * déjà converti en erreur stable par le client (`src/http/client.ts`) avant que ce code ne lise
 * un corps — seule une réponse 200 de forme inattendue passe par cette fonction.
 */
export function lireFiche(routeId: string, corps: unknown): Record<string, unknown> {
  if (typeof corps !== "object" || corps === null || Array.isArray(corps)) {
    throw erreurEnveloppeInattendue(routeId);
  }
  return corps as Record<string, unknown>;
}
