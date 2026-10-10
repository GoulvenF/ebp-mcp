import type { Budget } from "../../http/budget.js";
import type { DepsScan, IdentiteScan } from "../../pagination/scan.js";
import { scanner } from "../../pagination/scan.js";
import type { SourcePaginee } from "../../pagination/source-page.js";
import type { ExecutionContext } from "../../ports/execution-context.js";
import { erreurNonTrouve, erreurReferenceAmbigue, erreurResolutionIncomplete } from "./erreurs.js";

export interface OptionsResolution<E> {
  readonly contexte: ExecutionContext;
  /** Budget partagé explicite (D-T11-2) : chaque service crée un budget et le passe ici. */
  readonly budget?: Budget;
  readonly source: SourcePaginee<E>;
  /** Identité de scan ; `limite` est toujours forcée à `2` par cette fonction. */
  readonly identite: IdentiteScan;
  /** Prédicat de correspondance **exacte** (D-T11-3) : égalité stricte de chaîne opaque, jamais un nom. */
  readonly correspond: (element: E) => boolean;
}

/**
 * Résolution code/numéro (D-T11-3, 07 §6) : scanne la source avec une correspondance exacte,
 * `limite: 2` et `sansCurseur: true` (aucun état de curseur enregistré). Deux correspondances
 * exactes ⇒ `AMBIGUOUS_REFERENCE` ; scan complet sans correspondance ⇒ `NOT_FOUND` ; scan
 * interrompu (budget, quota, deadline, source incomplète) ⇒ `RESOLUTION_INCOMPLETE` avec
 * `details.raison`, même avec un seul candidat déjà trouvé ; scan complet avec une correspondance
 * ⇒ l'élément.
 */
export async function resoudreUnique<E>(deps: DepsScan, options: OptionsResolution<E>): Promise<E> {
  const resultat = await scanner(deps, {
    contexte: options.contexte,
    ...(options.budget !== undefined ? { budget: options.budget } : {}),
    source: options.source,
    limite: 2,
    sansCurseur: true,
    identite: { ...options.identite, limite: 2 },
    filtre: options.correspond,
  });

  if (resultat.resultats.length >= 2) {
    throw erreurReferenceAmbigue({ trouves: resultat.resultats.length });
  }

  if (resultat.completude === "partielle") {
    const raison = resultat.raisonArret === "limite" || resultat.raisonArret === "cursor_capacity" ? null : resultat.raisonArret;
    throw erreurResolutionIncomplete(raison, { trouves: resultat.resultats.length });
  }

  const premier = resultat.resultats[0];
  if (resultat.resultats.length === 0 || premier === undefined) {
    throw erreurNonTrouve();
  }

  return premier;
}
