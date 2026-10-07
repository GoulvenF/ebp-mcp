/** Profils, alias et groupes de quota (07 §2). */
export const RE_IDENTIFIANT = /^[a-z0-9][a-z0-9_-]{0,63}$/;

declare const identifiantBrand: unique symbol;

/** Type nominal : une chaîne qui a passé {@link estIdentifiant}. */
export type Identifiant = string & { readonly [identifiantBrand]: true };

export function estIdentifiant(valeur: unknown): valeur is Identifiant {
  return typeof valeur === "string" && RE_IDENTIFIANT.test(valeur);
}

const RE_CARACTERE_CONTROLE = /[\u0000-\u001f\u007f]/;

/**
 * Valide un identifiant distant opaque (ID Hubbix, dossier, etc.) (07 §2) : non vide, sans espace
 * de tête/fin, sans caractère de contrôle, sans séparateur de chemin ni encodage, longueur ≤ 200.
 */
export function validerIdDistant(valeur: unknown): string {
  if (typeof valeur !== "string" || valeur.length === 0) {
    throw new TypeError("Identifiant distant invalide : chaîne non vide attendue.");
  }
  if (valeur.length > 200) {
    throw new TypeError("Identifiant distant invalide : longueur supérieure à 200.");
  }
  if (valeur !== valeur.trim()) {
    throw new TypeError("Identifiant distant invalide : espace de tête ou de fin.");
  }
  if (RE_CARACTERE_CONTROLE.test(valeur)) {
    throw new TypeError("Identifiant distant invalide : caractère de contrôle.");
  }
  if (valeur.includes("/") || valeur.includes("\\") || valeur.includes("%")) {
    throw new TypeError("Identifiant distant invalide : séparateur ou encodage interdit.");
  }
  if (valeur === "." || valeur === "..") {
    throw new TypeError("Identifiant distant invalide : valeur réservée.");
  }
  return valeur;
}

/** Encode un identifiant distant déjà validé comme segment de chemin (routes de T07). */
export function versSegmentChemin(id: string): string {
  const valide = validerIdDistant(id);
  return encodeURIComponent(valide);
}

/** Validation syntaxique seulement (07 §2) : 8-4-4-4-12 hexadécimal, insensible à la casse. */
export function estGuid(valeur: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(valeur);
}
