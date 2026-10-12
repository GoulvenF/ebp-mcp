// Fixture de `tests/garde/garde-globale.test.ts` (exécution imbriquée seulement) : un test ordinaire
// tente un fetch non loopback et avale l'erreur. Le test passe ; seule la garde globale doit faire
// échouer la suite.
import { expect, it } from "vitest";

it("tente un fetch non loopback depuis le worker et avale l'erreur", async () => {
  const resultat = await fetch("http://garde-test.invalid/").then(
    () => "réponse",
    () => "erreur avalée",
  );
  expect(resultat).toBe("erreur avalée");
});
