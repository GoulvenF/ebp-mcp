// Fixture volontairement invalide, exclue de `tsconfig.json` (voir tests/type-error.test.ts).
// N'est jamais compilée par `npm run typecheck` ni `npm run build` sur le dépôt propre.
const valeurInvalide: string = 42;
export { valeurInvalide };
