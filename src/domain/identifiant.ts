const FORME_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Numéro de compte conservé tel quel (A26) : chaîne non vide, sans espace de bord. Ni retrait de
 * zéros, ni complétion à 8 chiffres, ni préfixe implicite. Aucune fonction d'équivalence n'est
 * fournie : deux comptes ne sont rapprochés que par égalité stricte de cette chaîne.
 */
export function estCompte(valeur: unknown): boolean {
  if (typeof valeur !== "string" || valeur.length === 0) {
    return false;
  }
  return valeur === valeur.trim();
}

/** Format RFC 4122, insensible à la casse ; la valeur n'est pas normalisée. */
export function estUuid(valeur: unknown): boolean {
  return typeof valeur === "string" && FORME_UUID.test(valeur);
}

/**
 * Codes tiers, numéros de document et références : chaîne non vide, zéros de tête et suffixes
 * préservés (`"0004100"` ≠ `"4100"`).
 */
export function estIdentifiantChaine(valeur: unknown): boolean {
  return typeof valeur === "string" && valeur.length > 0;
}
