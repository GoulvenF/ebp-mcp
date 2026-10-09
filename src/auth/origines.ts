import type { Environnement } from "../domain/capabilities.js";

/**
 * Hôte identité EBP (décision 1, 07 §3) : **le même hôte pour `prod` ET `preprod`**.
 * 🟡 Hypothèse non confirmée par la documentation officielle au-delà de l'exemple fourni ;
 * preuve à établir en recette — voir preuve E01 de docs/09-preuves-et-recette.md avant toute
 * activation live. Ne pas dériver cette constante par environnement tant que E01 n'est pas close.
 */
export const HOTE_IDENTITE = "https://api-login.ebp.com";

export const CHEMIN_AUTORIZE = "/connect/authorize";
export const CHEMIN_TOKEN = "/connect/token";

/** Toujours `HOTE_IDENTITE`, quel que soit l'environnement (décision 1). */
export function hoteIdentite(_environnement: Environnement): string {
  return HOTE_IDENTITE;
}

export function urlAutorize(environnement: Environnement): string {
  return `${hoteIdentite(environnement)}${CHEMIN_AUTORIZE}`;
}

export function urlToken(environnement: Environnement): string {
  return `${hoteIdentite(environnement)}${CHEMIN_TOKEN}`;
}

/** Vrai seulement si l'origine (schéma+hôte) de `url` est exactement l'hôte identité autorisé. */
export function estOrigineIdentiteAutorisee(url: string): boolean {
  let analysee: URL;
  try {
    analysee = new URL(url);
  } catch {
    return false;
  }
  return `${analysee.protocol}//${analysee.host}` === HOTE_IDENTITE;
}
