// Fixture de `tests/garde/garde-globale.test.ts` (exécution imbriquée seulement) : un test lance un
// processus Node enfant, sans `--import` explicite, qui tente un `net.connect` non loopback. Le test
// passe quel que soit le code de sortie de l'enfant ; seule la garde globale doit faire échouer la suite.
import { it } from "vitest";
import { spawn } from "node:child_process";
import { once } from "node:events";

it("lance un enfant qui tente une connexion non loopback", async () => {
  const enfant = spawn(
    process.execPath,
    ["-e", "require('node:net').connect({ host: 'garde-enfant.invalid', port: 80 }).on('error', () => {})"],
    { stdio: "ignore" },
  );
  await once(enfant, "exit");
});
