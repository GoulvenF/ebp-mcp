import { validerIdDistant } from "../config/identifiers.js";
import { erreurParametreNonDeclare, erreurSegmentInvalide, erreurSegmentManquant } from "./errors.js";
import type { EntreeRegistre } from "./registre.js";

export type ValeurParametre = string | number | boolean;

/**
 * Remplace chaque `{nom}` du gabarit par le segment validé et encodé (décision 6, 07 §4) : refus
 * d'un segment vide, `.`, `..`, contenant `/`, `\` ou un caractère de contrôle. Les IDs distants
 * restent des chaînes opaques, jamais normalisées.
 */
export function construireChemin(route: EntreeRegistre, segments: Readonly<Record<string, string>>): string {
  let chemin = route.chemin;
  for (const nom of route.segments) {
    const valeur = segments[nom];
    if (valeur === undefined) {
      throw erreurSegmentManquant(route.id, nom);
    }
    let encode: string;
    try {
      validerIdDistant(valeur);
      encode = encodeURIComponent(valeur);
    } catch {
      throw erreurSegmentInvalide(route.id, nom);
    }
    chemin = chemin.replace(`{${nom}}`, encode);
  }
  return chemin;
}

/**
 * Query encodée via `URLSearchParams`, clés triées pour un ordre stable (décision 6 : T08 en
 * dérivera une clé de cache). Un paramètre non déclaré par la route est refusé avant réseau.
 */
export function construireQuery(
  route: EntreeRegistre,
  parametres: Readonly<Record<string, ValeurParametre>> | undefined,
): URLSearchParams {
  const query = new URLSearchParams();
  if (parametres === undefined) {
    return query;
  }
  const cles = Object.keys(parametres).sort();
  for (const cle of cles) {
    if (!route.parametres.includes(cle)) {
      throw erreurParametreNonDeclare(route.id, cle);
    }
    query.set(cle, String(parametres[cle]));
  }
  return query;
}
