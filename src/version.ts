/**
 * Version unique du paquet, utilisée par le `User-Agent` du client HTTP (07 §4, décision 7).
 * Un test (`tests/http/version.test.ts`) vérifie l'égalité avec `package.json` : ne jamais
 * dupliquer ce littéral sans mettre à jour les deux en même temps.
 */
export const VERSION = "0.0.0";
