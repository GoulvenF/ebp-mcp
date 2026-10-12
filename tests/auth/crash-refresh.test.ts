import { createServer } from "node:http";
import type { Server } from "node:http";
import { spawn } from "node:child_process";
import { appendFile, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { creerOperationsFichierNode, creerStoreJson, creerTokenStoreFichier } from "../../dist/index.js";
import type { EnregistrementToken, EtatGenerations } from "../../dist/index.js";
import { creerRepertoireTemporaire, identiteTest, nettoyerRepertoire, portLibre } from "./fixtures.js";

const ICI = dirname(fileURLToPath(import.meta.url));
const SCRIPT_ENFANT = join(ICI, "enfant-crash-refresh.mjs");

interface ResultatEnfant {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
}

function lancerScript(args: string[]): { enfant: ReturnType<typeof spawn>; attendre: Promise<ResultatEnfant> } {
  const enfant = spawn(process.execPath, [SCRIPT_ENFANT, ...args], { stdio: ["ignore", "pipe", "pipe"] });
  const attendre = new Promise<ResultatEnfant>((resolve) => {
    enfant.on("exit", (code, signal) => resolve({ code, signal }));
  });
  return { enfant, attendre };
}

/** Attend qu'un fichier existe et contienne au moins une ligne non vide (poll borné, sans sleep fixe). */
async function attendreLigneDansFichier(chemin: string, timeoutMs: number): Promise<string> {
  const depart = Date.now();
  while (Date.now() - depart < timeoutMs) {
    try {
      const contenu = await readFile(chemin, "utf8");
      if (contenu.trim().length > 0) return contenu;
    } catch {
      // Fichier pas encore créé : on retente.
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Timeout : ${chemin} toujours vide après ${timeoutMs} ms.`);
}

describe("auth/crash-refresh (scénario 1 de 09 : crash réel pendant refresh)", () => {
  let dir: string;
  let serveur: Server;
  let port: number;
  const cheminRequetesRecues = () => join(dir, "requetes-identite.log");

  beforeEach(async () => {
    dir = await creerRepertoireTemporaire();
    port = await portLibre();
    serveur = createServer((req, res) => {
      void res; // jamais de réponse : simule le blocage réel décrit par le scénario.
      const morceaux: Buffer[] = [];
      req.on("data", (morceau: Buffer) => morceaux.push(morceau));
      req.on("end", () => {
        // Écrit seulement une fois le corps entièrement reçu : c'est la preuve que la requête est
        // réellement « partie » et arrivée côté serveur, pas une estimation de timing.
        const corps = Buffer.concat(morceaux).toString("utf8");
        void appendFile(cheminRequetesRecues(), `${corps}\n`, "utf8");
      });
    });
    await new Promise<void>((resolve) => serveur.listen(port, "127.0.0.1", resolve));
  });

  afterEach(async () => {
    serveur.closeAllConnections();
    await new Promise<void>((resolve) => serveur.close(() => resolve()));
    await nettoyerRepertoire(dir);
  });

  it(
    "processus tué (SIGKILL) après départ réel de la requête de refresh ⇒ le suivant obtient AUTH_REQUIRED, aucun rejeu de l'ancien refresh token, stockage non corrompu",
    async () => {
      const identite = identiteTest();
      const operations = creerOperationsFichierNode();
      const store = creerStoreJson({ operations });
      const cheminGenerations = join(dir, "generations.json");
      const cheminTokens = join(dir, "tokens.json");
      const tokenStore = creerTokenStoreFichier({ chemin: cheminTokens, store, operations });

      const ancienRefresh = "ancien-refresh-partage";
      const enregistrementExpire: EnregistrementToken = {
        accessToken: "ancien-access-partage",
        refreshToken: ancienRefresh,
        expiresAt: new Date(Date.now() - 1000).toISOString(),
        refreshedAt: new Date(Date.now() - 3600_000).toISOString(),
        refreshExpiresAtEstimate: null,
        generation: 1,
        state: "ready",
      };
      await tokenStore.write(identite, enregistrementExpire);
      await store.ecrire(cheminGenerations, "auth-generations", {
        schemaVersion: 1,
        derniereReservee: 1,
        revoqueeJusqua: 0,
      } satisfies EtatGenerations);

      const cheminResultatVictime = join(dir, "resultat-victime.json");
      const { enfant: victime, attendre: finVictime } = lancerScript([
        dir,
        String(port),
        "victime",
        cheminResultatVictime,
      ]);

      // Attend que le faux serveur d'identité ait réellement reçu la requête complète de la
      // victime : la fenêtre de kill tombe forcément après le départ réel, jamais avant.
      await attendreLigneDansFichier(cheminRequetesRecues(), 5000);
      victime.kill("SIGKILL");
      const { signal } = await finVictime;
      expect(signal).toBe("SIGKILL");

      // Marqueur `refreshing` encore récent juste après le kill : aucun processus ne doit le
      // rejouer (vérifié avant le passage par la branche d'abandon, qui le réécrit).
      const brutTokensApresKill = await readFile(cheminTokens, "utf8");
      const enveloppeApresKill = JSON.parse(brutTokensApresKill) as {
        type: string;
        data: EnregistrementToken;
      };
      expect(enveloppeApresKill.data.state).toBe("refreshing");

      // Premier observateur : horloge décalée de DELAI_ABANDON_REFRESH_MS + 1000 ms (voir
      // enfant-crash-refresh.mjs), donc le marqueur `refreshing` de la victime est vu comme dépassé.
      // C'est la branche `abandonne` de 07 §3 (AUTH_REQUIRED explicite), jamais une deadline d'appel
      // expirée : aucune requête n'est émise et l'ancien refresh token n'est jamais rejoué.
      const cheminResultatAbandon = join(dir, "resultat-observateur-abandon.json");
      const cheminLogTransportAbandon = join(dir, "transport-observateur-abandon.log");
      const { attendre: finAbandon } = lancerScript([
        dir,
        String(port),
        "observateur-abandon",
        cheminResultatAbandon,
        cheminLogTransportAbandon,
      ]);
      await finAbandon;

      const resultatAbandon = JSON.parse(await readFile(cheminResultatAbandon, "utf8")) as {
        ok: boolean;
        code: string | null;
        message: string;
      };
      expect(resultatAbandon.ok).toBe(false);
      expect(resultatAbandon.code).toBe("AUTH_REQUIRED");
      expect(resultatAbandon.message).toContain("Rafraîchissement précédent abandonné");

      // Zéro requête émise par ce premier observateur.
      await expect(readFile(cheminLogTransportAbandon, "utf8")).rejects.toMatchObject({ code: "ENOENT" });

      // Exactement une requête reçue par le faux serveur, et elle porte l'ancien refresh token —
      // jamais un second rejeu, quel que soit le nombre de processus qui observent ensuite.
      const requetesApresAbandon = (await readFile(cheminRequetesRecues(), "utf8")).trim().split("\n").filter(Boolean);
      expect(requetesApresAbandon).toHaveLength(1);
      const champs = new URLSearchParams(requetesApresAbandon[0]);
      expect(champs.get("refresh_token")).toBe(ancienRefresh);
      expect(champs.get("grant_type")).toBe("refresh_token");

      // Stockage cohérent : JSON entier et valide, jamais tronqué par le SIGKILL, basculé en
      // `reauth_required` par la branche d'abandon, refresh token et génération inchangés.
      const brutTokensApresAbandon = await readFile(cheminTokens, "utf8");
      const enveloppeApresAbandon = JSON.parse(brutTokensApresAbandon) as {
        storeVersion: number;
        type: string;
        data: EnregistrementToken;
      };
      expect(enveloppeApresAbandon.type).toBe("tokens");
      const tokenApresAbandon = enveloppeApresAbandon.data;
      expect(tokenApresAbandon.state).toBe("reauth_required");
      expect(tokenApresAbandon.refreshToken).toBe(ancienRefresh);
      expect(tokenApresAbandon.generation).toBe(2);

      // Second observateur, horloge normale : le stockage est déjà `reauth_required`, donc
      // AUTH_REQUIRED par la branche `reauth` (07 §3), toujours sans aucune requête émise.
      const cheminResultatReauth = join(dir, "resultat-observateur-reauth.json");
      const cheminLogTransportReauth = join(dir, "transport-observateur-reauth.log");
      const { attendre: finReauth } = lancerScript([
        dir,
        String(port),
        "observateur-reauth",
        cheminResultatReauth,
        cheminLogTransportReauth,
      ]);
      await finReauth;

      const resultatReauth = JSON.parse(await readFile(cheminResultatReauth, "utf8")) as {
        ok: boolean;
        code: string | null;
        message: string;
      };
      expect(resultatReauth.ok).toBe(false);
      expect(resultatReauth.code).toBe("AUTH_REQUIRED");
      expect(resultatReauth.message).toContain("Réauthentification requise");
      await expect(readFile(cheminLogTransportReauth, "utf8")).rejects.toMatchObject({ code: "ENOENT" });

      // Toujours une seule requête reçue par le faux serveur au total.
      const requetesApresReauth = (await readFile(cheminRequetesRecues(), "utf8")).trim().split("\n").filter(Boolean);
      expect(requetesApresReauth).toHaveLength(1);
    },
    15000,
  );
});
