/** Résultat d'interprétation d'une valeur enum source face aux valeurs connues du contrat. */
export interface ResultatEnum<T extends string> {
  valeur: T | "inconnu";
  valeur_origine: string | null;
  avertissement: string | null;
}

/**
 * Valeur connue ⇒ renvoyée telle quelle, sans avertissement. Valeur inconnue ⇒ `"inconnu"` avec
 * un avertissement citant la valeur d'origine (A26, 07 §5). Jamais de repli silencieux sur une
 * valeur par défaut, jamais `0`/`false`.
 */
export function interpreterEnum<T extends string>(
  valeurSource: unknown,
  valeursConnues: readonly T[],
): ResultatEnum<T> {
  if (typeof valeurSource === "string" && (valeursConnues as readonly string[]).includes(valeurSource)) {
    return { valeur: valeurSource as T, valeur_origine: null, avertissement: null };
  }
  const origine = typeof valeurSource === "string" ? valeurSource : null;
  return {
    valeur: "inconnu",
    valeur_origine: origine,
    avertissement: `Valeur enum inconnue reçue de la source : ${JSON.stringify(valeurSource)}`,
  };
}
