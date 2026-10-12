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

      // L'observateur suit immédiatement, avec sa propre deadline volontairement courte (07 §3) :
      // le marqueur `refreshing` est encore récent (bien en-deçà de DELAI_ABANDON_REFRESH_MS), donc
      // il n'est jamais rejoué et l'observateur n'émet lui-même aucune requête.
      const cheminResultatObservateur = join(dir, "resultat-observateur.json");
      const cheminLogTransportObservateur = join(dir, "transport-observateur.log");
      const { attendre: finObservateur } = lancerScript([
        dir,
        String(port),
        "observateur",
        cheminResultatObservateur,
        cheminLogTransportObservateur,
      ]);
      await finObservateur;

      const resultatObservateur = JSON.parse(await readFile(cheminResultatObservateur, "utf8")) as {
        ok: boolean;
        code: string | null;
      };
      expect(resultatObservateur.ok).toBe(false);
      expect(resultatObservateur.code).toBe("AUTH_REQUIRED");

      // Zéro requête émise par l'observateur (il n'est jamais devenu rafraîchisseur).
      await expect(readFile(cheminLogTransportObservateur, "utf8")).rejects.toMatchObject({ code: "ENOENT" });

      // Exactement une requête reçue par le faux serveur, et elle porte l'ancien refresh token —
      // jamais un second rejeu, quel que soit le nombre de processus qui observent ensuite.
      const requetesRecues = (await readFile(cheminRequetesRecues(), "utf8")).trim().split("\n").filter(Boolean);
      expect(requetesRecues).toHaveLength(1);
      const champs = new URLSearchParams(requetesRecues[0]);
      expect(champs.get("refresh_token")).toBe(ancienRefresh);
      expect(champs.get("grant_type")).toBe("refresh_token");

      // Stockage cohérent : JSON entier et valide, jamais tronqué par le SIGKILL, marqueur
      // `refreshing` de la victime laissé tel quel (le refresh token n'a pas été effacé, pas rejoué).
      const brutTokens = await readFile(cheminTokens, "utf8");
      const enveloppe = JSON.parse(brutTokens) as { storeVersion: number; type: string; data: EnregistrementToken };
      expect(enveloppe.type).toBe("tokens");
      const token = enveloppe.data;
      expect(token.state).toBe("refreshing");
      expect(token.refreshToken).toBe(ancienRefresh);
      expect(token.generation).toBe(2);
    },
    15000,
  );
});
