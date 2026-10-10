/**
 * Résultat d'interprétation d'une valeur enum source (voir {@link interpreterEnumNumerique} et
 * {@link interpreterEnumChaine}).
 */
export interface ResultatEnumSource<T extends string> {
  readonly valeur: T | "inconnu";
  readonly avertissement: string | null;
}

/**
 * Interprétation d'une énumération source codée en nombre (`documentStatus`, `settlementType`,
 * `accountingTransferStatus`, 02 §3) : contrairement à `interpreterEnum` (`src/domain/enum.ts`),
 * réservé aux énumérations déjà fournies en chaîne, cette fonction compare le nombre source
 * directement à la table connue — jamais de conversion en chaîne avant comparaison, pour ne pas
 * requalifier la valeur dans l'avertissement. Distingue explicitement un champ absent (`null`/
 * `undefined`) d'une valeur présente mais hors énumération : les deux cas produiraient le même
 * avertissement générique si on les traitait identiquement, masquant un vrai risque de diagnostic
 * sur les champs nécessaires au routage (`documentStatus`) ou à la nature d'un règlement
 * (`settlementType`).
 */
export function interpreterEnumNumerique<T extends string>(
  valeurSource: unknown,
  table: ReadonlyMap<number, T>,
  nomChamp: string,
): ResultatEnumSource<T> {
  if (valeurSource === undefined || valeurSource === null) {
    return { valeur: "inconnu", avertissement: `Champ ${nomChamp} absent de la source.` };
  }
  if (typeof valeurSource === "number" && table.has(valeurSource)) {
    return { valeur: table.get(valeurSource) as T, avertissement: null };
  }
  return {
    valeur: "inconnu",
    avertissement: `Valeur enum inconnue reçue de la source pour ${nomChamp} : ${JSON.stringify(valeurSource)}`,
  };
}

/**
 * Interprétation d'une énumération source codée en chaîne (`documentType`, 02 §3) : même
 * distinction absent/inconnu que {@link interpreterEnumNumerique}, pour les champs nécessaires au
 * routage (A13) qui arrivent en chaîne plutôt qu'en nombre. Contrairement à `interpreterEnum`
 * (`src/domain/enum.ts`), qui requalifie toute valeur non-string en `null` avant de la citer,
 * cette fonction cite la valeur source telle quelle, quel que soit son type, et nomme le champ
 * dans l'avertissement.
 */
export function interpreterEnumChaine<T extends string>(
  valeurSource: unknown,
  valeursConnues: readonly T[],
  nomChamp: string,
): ResultatEnumSource<T> {
  if (valeurSource === undefined || valeurSource === null) {
    return { valeur: "inconnu", avertissement: `Champ ${nomChamp} absent de la source.` };
  }
  if (typeof valeurSource === "string" && (valeursConnues as readonly string[]).includes(valeurSource)) {
    return { valeur: valeurSource as T, avertissement: null };
  }
  return {
    valeur: "inconnu",
    avertissement: `Valeur enum inconnue reçue de la source pour ${nomChamp} : ${JSON.stringify(valeurSource)}`,
  };
}
