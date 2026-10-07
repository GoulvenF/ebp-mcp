const REDACTED = "[redacted]";
const INSPECT_CUSTOM = Symbol.for("nodejs.util.inspect.custom");

/**
 * Enveloppe non sérialisable par construction (décision 5, 07 §2) : un `JSON.stringify` ou un
 * `console.error`/`util.inspect` accidentel ne peut jamais publier la valeur.
 */
export interface Secret {
  reveler(): string;
  readonly longueur: number;
  toJSON(): string;
  toString(): string;
  [INSPECT_CUSTOM](): string;
}

export function secret(valeur: string): Secret {
  return {
    reveler: () => valeur,
    longueur: valeur.length,
    toJSON: () => REDACTED,
    toString: () => REDACTED,
    [INSPECT_CUSTOM]: () => REDACTED,
  };
}
