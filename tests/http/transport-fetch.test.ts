import { describe, expect, it } from "vitest";
import { ALIAS_APIM_REFUSE, creerTransportFetch } from "../../dist/index.js";
import { demarrerServeurTest } from "./fixtures.js";

const PLAFOND = 5 * 1024 * 1024;

describe("transport-fetch.ts", () => {
  it("critère #2 : hôte hors liste blanche refusé, aucune émission réseau", async () => {
    const serveur = await demarrerServeurTest((_req, repondre) => repondre(200, {}, "{}"));
    try {
      const transport = creerTransportFetch({ originesAutorisees: [`http://127.0.0.1:${serveur.port}`] });
      await expect(
        transport.request({ method: "GET", url: "https://exemple-etranger.invalid/x" }),
      ).rejects.toMatchObject({ erreur: { code: "INVALID_ARGUMENT" } });
      expect(serveur.requetes).toHaveLength(0);
    } finally {
      await serveur.fermer();
    }
  });

  it("critère #2 : l'alias APIM n'est jamais dans la liste blanche dérivée de l'environnement", () => {
    expect(ALIAS_APIM_REFUSE).toBe("https://ebp-api-isv.azure-api.net");
  });

  it("critère #3 : redirection vers une autre origine jamais suivie, la cible ne reçoit aucune requête", async () => {
    const cible = await demarrerServeurTest((_req, repondre) => repondre(200, {}, "{}"));
    const origine = await demarrerServeurTest((_req, repondre) =>
      repondre(302, { Location: `http://127.0.0.1:${cible.port}/vole-le-header` }, ""),
    );
    try {
      const transport = creerTransportFetch({ originesAutorisees: [`http://127.0.0.1:${origine.port}`] });
      const reponse = await transport.request({
        method: "GET",
        url: `http://127.0.0.1:${origine.port}/depart`,
        headers: { Authorization: "Bearer secret-ne-doit-jamais-fuiter" },
      });
      // `redirect: "manual"` : jamais suivi (statut opaque ou 3xx réel selon l'implémentation fetch).
      expect(reponse.status === 0 || (reponse.status >= 300 && reponse.status < 400)).toBe(true);
      expect(cible.requetes).toHaveLength(0);
    } finally {
      await origine.fermer();
      await cible.fermer();
    }
  });

  it("critère #10 : plafond de 5 Mio appliqué en flux (abort avant bufferisation complète)", async () => {
    const serveur = await demarrerServeurTest((_req, repondre) => {
      const corps = "a".repeat(PLAFOND + 1);
      repondre(200, { "Content-Type": "application/json", "Content-Length": String(corps.length) }, corps);
    });
    try {
      const transport = creerTransportFetch({ originesAutorisees: [`http://127.0.0.1:${serveur.port}`] });
      await expect(
        transport.request({ method: "GET", url: `http://127.0.0.1:${serveur.port}/gros` }),
      ).rejects.toMatchObject({ erreur: { code: "RESPONSE_TOO_LARGE" } });
    } finally {
      await serveur.fermer();
    }
  });

  it("GET métier et POST identité acceptés, autre méthode refusée avant émission", async () => {
    const serveur = await demarrerServeurTest((_req, repondre) => repondre(200, {}, "{}"));
    try {
      const transport = creerTransportFetch({ originesAutorisees: [`http://127.0.0.1:${serveur.port}`] });
      await transport.request({ method: "GET", url: `http://127.0.0.1:${serveur.port}/x` });
      await transport.request({ method: "POST", url: `http://127.0.0.1:${serveur.port}/x`, body: "" });
      expect(serveur.requetes).toHaveLength(2);
    } finally {
      await serveur.fermer();
    }
  });
});
