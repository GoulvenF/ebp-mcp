#!/usr/bin/env node
// Processus enfant pour tests/auth/crash-refresh.test.ts (scénario 1, 09 « crash après départ
// refresh ») : deux rôles réels, jamais simulés.
//
// - "victime" : démarre un refresh (token expiré), dont le seul échange réseau va réellement vers
//   un faux serveur d'identité loopback qui ne répond jamais. Le processus parent tue ce processus
//   (SIGKILL) une fois que le serveur a *réellement* reçu la requête complète — la fenêtre de kill
//   est donc prouvée par un événement réseau réel, pas par un délai arbitraire.
// - "observateur" : lancé après la mort de la victime, sur la même identité de stockage. Doit
//   obtenir AUTH_REQUIRED sans jamais devenir lui-même rafraîchisseur (donc sans émettre de requête
//   vers l'hôte identité), puisque le marqueur `refreshing` est encore récent (< DELAI_ABANDON_
//   REFRESH_MS) : sa propre deadline, volontairement courte, expire avant toute transition.
import { appendFile, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  assurerTokenValide,
  creerGestionnaireVerrous,
  creerOperationsFichierNode,
  creerStoreJson,
  creerTokenStoreFichier,
  nomVerrouIdentite,
} from "../../dist/index.js";

const [, , repertoire, port, mode, cheminResultat, cheminLogTransport] = process.argv;

const clock = {
  now: () => new Date(),
  wait: (duree, signal) =>
    new Promise((resolve) => {
      if (signal?.aborted === true) {
        resolve();
        return;
      }
      const minuteur = setTimeout(resolve, duree);
      signal?.addEventListener("abort", () => {
        clearTimeout(minuteur);
        resolve();
      }, { once: true });
    }),
};

const identite = { profil: "default", environnement: "prod", empreinteClientId: "empreinte-crash" };
const operations = creerOperationsFichierNode();
const verrous = creerGestionnaireVerrous({ repertoire, operations, clock });
const store = creerStoreJson({ operations });
const cheminGenerations = join(repertoire, "generations.json");
const cheminTokens = join(repertoire, "tokens.json");
const tokenStore = creerTokenStoreFichier({ chemin: cheminTokens, store, operations });
const nomVerrou = nomVerrouIdentite(`${identite.profil}.${identite.environnement}.${identite.empreinteClientId}`);

/**
 * Transport réel vers le faux serveur d'identité loopback démarré par le test parent : ignore
 * `spec.url` (toujours l'hôte EBP fixe, 07 §3) et contacte 127.0.0.1 à la place, exactement comme
 * tests/auth/enfant-refresh.mjs le fait déjà pour un échange immédiat — ici l'échange est un vrai
 * aller-retour TCP qui ne revient jamais, pour fournir une fenêtre de kill réelle.
 */
const transport = {
  async request(spec) {
    if (cheminLogTransport !== undefined) {
      await appendFile(cheminLogTransport, `${process.pid} ${spec.method}\n`, "utf8");
    }
    const reponse = await fetch(`http://127.0.0.1:${port}/connect/token`, {
      method: "POST",
      headers: spec.headers,
      body: spec.body,
      signal: spec.signal,
    });
    const corps = await reponse.text();
    return { status: reponse.status, headers: {}, body: corps };
  },
};

async function main() {
  const deadlineMs = mode === "victime" ? 60_000 : 1_200;
  const resultat = await assurerTokenValide(
    { transport, clock, verrous, store, tokenStore, identite, nomVerrou, cheminGenerations, profilAuth: { clientId: "client-crash" } },
    { budgetRestant: 30, deadline: new Date(Date.now() + deadlineMs) },
  );
  await writeFile(cheminResultat, JSON.stringify({ ok: true, accessToken: resultat.accessToken }), "utf8");
}

main()
  .then(() => {
    process.stdout.write("ok\n");
  })
  .catch(async (erreur) => {
    const code = typeof erreur === "object" && erreur !== null && "erreur" in erreur ? erreur.erreur.code : null;
    await writeFile(cheminResultat, JSON.stringify({ ok: false, code, message: String(erreur?.message ?? erreur) }), "utf8");
    process.stdout.write("erreur-ecrite\n");
  });
