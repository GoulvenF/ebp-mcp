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
