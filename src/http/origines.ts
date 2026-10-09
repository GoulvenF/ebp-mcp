import type { Environnement } from "../domain/capabilities.js";
import { HOTE_IDENTITE } from "../auth/origines.js";

/** Origines métier fixes par environnement (décision 2, 02 §1). */
export const ORIGINE_PROD = "https://api-developpeurs.ebp.com";
export const ORIGINE_PREPROD = "https://api-developpeurs-preprod.ebp.com";

/** Alias APIM observé dans la documentation (02 §1) : jamais utilisé, refusé explicitement. */
export const ALIAS_APIM_REFUSE = "https://ebp-api-isv.azure-api.net";

/** Origine métier dérivée de l'environnement (décision 2) : jamais fournie par un argument. */
export function origineMetier(environnement: Environnement): string {
  return environnement === "prod" ? ORIGINE_PROD : ORIGINE_PREPROD;
}

/** Les deux seules origines autorisées pour un environnement donné : métier + identité. */
export function originesAutoriseesPour(environnement: Environnement): readonly string[] {
  return [origineMetier(environnement), HOTE_IDENTITE];
}

function origineDeUrl(url: string): string | null {
  try {
    const analysee = new URL(url);
    return `${analysee.protocol}//${analysee.host}`;
  } catch {
    return null;
  }
}

/** Vrai seulement si l'origine (schéma+hôte) de `url` fait partie de la liste blanche de l'environnement. */
export function estOrigineAutorisee(url: string, environnement: Environnement): boolean {
  const origine = origineDeUrl(url);
  return origine !== null && originesAutoriseesPour(environnement).includes(origine);
}
