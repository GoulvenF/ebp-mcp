// Fixture de `tests/garde/garde-globale.test.ts` (exécution imbriquée seulement) : connexion
// loopback seulement, depuis le worker et depuis un enfant. La suite doit rester verte.
import { expect, it } from "vitest";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";

it("se connecte en loopback depuis le worker et depuis un enfant", async () => {
  const serveur = createServer((socket) => socket.end()).listen(0, "127.0.0.1");
  await once(serveur, "listening");
  const adresse = serveur.address();
  const port = typeof adresse === "object" && adresse !== null ? adresse.port : 0;
  try {
    const reponse = await fetch(`http://127.0.0.1:${port}/`).catch(() => "connexion fermée");
    expect(reponse).toBe("connexion fermée");
    const enfant = spawn(
      process.execPath,
      ["-e", `require('node:net').connect({ host: '127.0.0.1', port: ${port} }).on('connect', () => process.exit(0)).on('error', () => process.exit(1))`],
      { stdio: "ignore" },
    );
    const [code] = await once(enfant, "exit");
    expect(code).toBe(0);
  } finally {
    serveur.close();
  }
});
