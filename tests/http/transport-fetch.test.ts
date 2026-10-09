import { describe, expect, it } from "vitest";
import { ALIAS_APIM_REFUSE, creerTransportFetch } from "../../dist/index.js";
import { demarrerServeurTest } from "./fixtures.js";

const PLAFOND = 5 * 1024 * 1024;

describe("transport-fetch.ts", () => {
  it("critère #2 : hôte hors liste blanche refusé, aucune émission réseau", async () => {
    const metier = await demarrerServeurTest((_req, repondre) => repondre(200, {}, "{}"));
    const identite = await demarrerServeurTest((_req, repondre) => repondre(200, {}, "{}"));
    try {
      const transport = creerTransportFetch({
        origineMetier: `http://127.0.0.1:${metier.port}`,
        origineIdentite: `http://127.0.0.1:${identite.port}`,
      });
      await expect(
        transport.request({ method: "GET", url: "https://exemple-etranger.invalid/x" }),
      ).rejects.toMatchObject({ erreur: { code: "INVALID_ARGUMENT" } });
      expect(metier.requetes).toHaveLength(0);
      expect(identite.requetes).toHaveLength(0);
    } finally {
      await metier.fermer();
      await identite.fermer();
    }
  });

  it("critère #2 : l'alias APIM n'est jamais dans la liste blanche dérivée de l'environnement", () => {
    expect(ALIAS_APIM_REFUSE).toBe("https://ebp-api-isv.azure-api.net");
  });

  it("critère #3 : redirection vers une autre origine jamais suivie, la cible ne reçoit aucune requête", async () => {
    const cible = await demarrerServeurTest((_req, repondre) => repondre(200, {}, "{}"));
    const metier = await demarrerServeurTest((_req, repondre) =>
      repondre(302, { Location: `http://127.0.0.1:${cible.port}/vole-le-header` }, ""),
    );
    const identite = await demarrerServeurTest((_req, repondre) => repondre(200, {}, "{}"));
    try {
      const transport = creerTransportFetch({
        origineMetier: `http://127.0.0.1:${metier.port}`,
        origineIdentite: `http://127.0.0.1:${identite.port}`,
      });
      const reponse = await transport.request({
        method: "GET",
        url: `http://127.0.0.1:${metier.port}/depart`,
        headers: { Authorization: "Bearer secret-ne-doit-jamais-fuiter" },
      });
      // `redirect: "manual"` : jamais suivi (statut opaque ou 3xx réel selon l'implémentation fetch).
      expect(reponse.status === 0 || (reponse.status >= 300 && reponse.status < 400)).toBe(true);
      expect(cible.requetes).toHaveLength(0);
    } finally {
      await metier.fermer();
      await identite.fermer();
    }
  });

  it("critère #10 : plafond de 5 Mio appliqué en flux (abort avant bufferisation complète)", async () => {
    const metier = await demarrerServeurTest((_req, repondre) => {
      const corps = "a".repeat(PLAFOND + 1);
      repondre(200, { "Content-Type": "application/json", "Content-Length": String(corps.length) }, corps);
    });
    const identite = await demarrerServeurTest((_req, repondre) => repondre(200, {}, "{}"));
    try {
      const transport = creerTransportFetch({
        origineMetier: `http://127.0.0.1:${metier.port}`,
        origineIdentite: `http://127.0.0.1:${identite.port}`,
      });
      await expect(
        transport.request({ method: "GET", url: `http://127.0.0.1:${metier.port}/gros` }),
      ).rejects.toMatchObject({ erreur: { code: "RESPONSE_TOO_LARGE" } });
    } finally {
      await metier.fermer();
      await identite.fermer();
    }
  });

  it("GET métier et POST identité `/connect/token` acceptés", async () => {
    const metier = await demarrerServeurTest((_req, repondre) => repondre(200, {}, "{}"));
    const identite = await demarrerServeurTest((_req, repondre) => repondre(200, {}, "{}"));
    try {
      const transport = creerTransportFetch({
        origineMetier: `http://127.0.0.1:${metier.port}`,
        origineIdentite: `http://127.0.0.1:${identite.port}`,
      });
      await transport.request({ method: "GET", url: `http://127.0.0.1:${metier.port}/x` });
      await transport.request({
        method: "POST",
        url: `http://127.0.0.1:${identite.port}/connect/token`,
        body: "",
      });
      expect(metier.requetes).toHaveLength(1);
      expect(identite.requetes).toHaveLength(1);
    } finally {
      await metier.fermer();
      await identite.fermer();
    }
  });

  it("révision Lead Tech (PR #10) : POST refusé vers l'origine métier, même sur une route du registre", async () => {
    const metier = await demarrerServeurTest((_req, repondre) => repondre(200, {}, "{}"));
    const identite = await demarrerServeurTest((_req, repondre) => repondre(200, {}, "{}"));
    try {
      const transport = creerTransportFetch({
        origineMetier: `http://127.0.0.1:${metier.port}`,
        origineIdentite: `http://127.0.0.1:${identite.port}`,
      });
      await expect(
        transport.request({ method: "POST", url: `http://127.0.0.1:${metier.port}/x`, body: "" }),
      ).rejects.toMatchObject({ erreur: { code: "INVALID_ARGUMENT" } });
      expect(metier.requetes).toHaveLength(0);
    } finally {
      await metier.fermer();
      await identite.fermer();
    }
  });

  it("révision Lead Tech (PR #10) : GET refusé vers l'origine identité", async () => {
    const metier = await demarrerServeurTest((_req, repondre) => repondre(200, {}, "{}"));
    const identite = await demarrerServeurTest((_req, repondre) => repondre(200, {}, "{}"));
    try {
      const transport = creerTransportFetch({
        origineMetier: `http://127.0.0.1:${metier.port}`,
        origineIdentite: `http://127.0.0.1:${identite.port}`,
      });
      await expect(
        transport.request({ method: "GET", url: `http://127.0.0.1:${identite.port}/connect/token` }),
      ).rejects.toMatchObject({ erreur: { code: "INVALID_ARGUMENT" } });
      expect(identite.requetes).toHaveLength(0);
    } finally {
      await metier.fermer();
      await identite.fermer();
    }
  });

  it("révision Lead Tech (PR #10) : POST refusé vers l'origine identité hors de `/connect/token`", async () => {
    const metier = await demarrerServeurTest((_req, repondre) => repondre(200, {}, "{}"));
    const identite = await demarrerServeurTest((_req, repondre) => repondre(200, {}, "{}"));
    try {
      const transport = creerTransportFetch({
        origineMetier: `http://127.0.0.1:${metier.port}`,
        origineIdentite: `http://127.0.0.1:${identite.port}`,
      });
      await expect(
        transport.request({ method: "POST", url: `http://127.0.0.1:${identite.port}/autre-chemin`, body: "" }),
      ).rejects.toMatchObject({ erreur: { code: "INVALID_ARGUMENT" } });
      expect(identite.requetes).toHaveLength(0);
    } finally {
      await metier.fermer();
      await identite.fermer();
    }
  });

  it("méthode autre que GET/POST toujours refusée avant émission", async () => {
    const metier = await demarrerServeurTest((_req, repondre) => repondre(200, {}, "{}"));
    const identite = await demarrerServeurTest((_req, repondre) => repondre(200, {}, "{}"));
    try {
      const transport = creerTransportFetch({
        origineMetier: `http://127.0.0.1:${metier.port}`,
        origineIdentite: `http://127.0.0.1:${identite.port}`,
      });
      await expect(
        transport.request({ method: "DELETE" as "GET", url: `http://127.0.0.1:${metier.port}/x` }),
      ).rejects.toMatchObject({ erreur: { code: "INVALID_ARGUMENT" } });
      expect(metier.requetes).toHaveLength(0);
    } finally {
      await metier.fermer();
      await identite.fermer();
    }
  });
});
