import { erreurTexteVide } from "./erreurs.js";

/**
 * Filtre texte commun (D-T11-4, 07 §6) : normalisation Unicode `NFC` puis `toLowerCase()` des
 * deux côtés, correspondance par inclusion. Aucune suppression d'accents. `search`/`filter.query`
 * EBP ne sont jamais envoyés pour ce filtre : la sémantique n'est pas prouvée (E06), le scan et le
 * filtrage restent locaux sous budget.
 */
export function correspondTexte(texte: string, champs: ReadonlyArray<string | null | undefined>): boolean {
  if (texte.trim().length === 0) {
    throw erreurTexteVide();
  }
  const aiguille = texte.normalize("NFC").toLowerCase();
  return champs.some((champ) => {
    if (champ === null || champ === undefined) {
      return false;
    }
    return champ.normalize("NFC").toLowerCase().includes(aiguille);
  });
}
