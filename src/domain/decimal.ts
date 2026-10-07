import Big from "big.js";

// Seul module du projet à importer big.js et à fixer sa configuration globale (07 §1).
Big.DP = 20;
Big.RM = Big.roundHalfUp;
Big.PE = 1e6;
Big.NE = -1e6;

/** Chaîne décimale canonique, p. ex. "1287.50". Jamais de `number` pour une valeur dont la précision compte. */
export type DecimalString = string;

function toBig(value: DecimalString): Big {
  return new Big(value);
}

export function isValidDecimalString(value: string): boolean {
  try {
    toBig(value);
    return true;
  } catch {
    return false;
  }
}

export function decimalAdd(a: DecimalString, b: DecimalString): DecimalString {
  return toBig(a).plus(toBig(b)).toFixed();
}

export function decimalSubtract(a: DecimalString, b: DecimalString): DecimalString {
  return toBig(a).minus(toBig(b)).toFixed();
}

export function decimalCompare(a: DecimalString, b: DecimalString): -1 | 0 | 1 {
  const cmp = toBig(a).cmp(toBig(b));
  return cmp as -1 | 0 | 1;
}

/**
 * Arrondi half-up à l'opposé de zéro (convention D09) : `"-2.345"` -\> `"-2.35"`.
 * Utiliser une seule fois en fin de calcul, jamais à chaque étape intermédiaire (07 §5).
 */
export function decimalRoundHalfUp(value: DecimalString, decimalPlaces: number): DecimalString {
  return toBig(value).round(decimalPlaces, Big.roundHalfUp).toFixed(decimalPlaces);
}

const LEXEME_DECIMAL = /^-?\d+(\.\d+)?$/;

/**
 * Parse un lexème décimal sans jamais passer par `Number`/`parseFloat` (07 §5) : un entier ou
 * décimal au-delà de la précision IEEE-754 garde tous ses chiffres. Entrée non exploitable ⇒
 * `null`, jamais `"0"` (une donnée inconnue n'est pas un zéro).
 */
export function decimalDepuisLexeme(lexeme: unknown): DecimalString | null {
  if (typeof lexeme !== "string") {
    return null;
  }
  if (!LEXEME_DECIMAL.test(lexeme)) {
    return null;
  }
  return toBig(lexeme).toFixed();
}

/** Somme exacte. Liste vide ⇒ `"0"`, zéro d'agrégation vide, pas une donnée inconnue. */
export function decimalSomme(valeurs: readonly DecimalString[]): DecimalString {
  return valeurs.reduce((acc, valeur) => toBig(acc).plus(toBig(valeur)).toFixed(), "0");
}

export function decimalNegate(valeur: DecimalString): DecimalString {
  return toBig(valeur).times(-1).toFixed();
}

export function decimalEstNegatif(valeur: DecimalString): boolean {
  return toBig(valeur).lt(0);
}

/**
 * Inverse le signe d'un montant d'avoir au plus une fois (A01). `"deja_negatif"` renvoie le
 * montant tel quel (idempotent, même négatif) ; `"positif_a_inverser"` inverse une seule fois.
 * Aucune agrégation de chiffre d'affaires n'est construite ici.
 */
export function normaliserSigneAvoir(
  montant: DecimalString,
  convention: "deja_negatif" | "positif_a_inverser",
): DecimalString {
  if (convention === "deja_negatif") {
    return toBig(montant).toFixed();
  }
  return decimalNegate(montant);
}

/**
 * Deux décimales, half-up à l'opposé de zéro, destiné à une fin de calcul (07 §5/D09). Ne pas
 * utiliser entre deux étapes intermédiaires : `decimalAdd` conserve la précision complète.
 */
export function formaterMontantEur(valeur: DecimalString): DecimalString {
  return decimalRoundHalfUp(valeur, 2);
}

/**
 * `echelle: null` ⇒ aucun arrondi supposé hors EUR (07 §5) : la valeur canonique est renvoyée
 * inchangée. `echelle` fourni ⇒ arrondi half-up à ce nombre de décimales.
 */
export function formaterMontantDevise(
  valeur: DecimalString,
  echelle: number | null,
): DecimalString {
  if (echelle === null) {
    return toBig(valeur).toFixed();
  }
  return decimalRoundHalfUp(valeur, echelle);
}
