#!/usr/bin/env node
// Processus enfant pour tests/auth/crash-refresh.test.ts (scénario 1, 09 « crash après départ
// refresh ») : trois rôles réels, jamais simulés.
//
// - "victime" : démarre un refresh (token expiré), dont le seul échange réseau va réellement vers
//   un faux serveur d'identité loopback qui ne répond jamais. Le processus parent tue ce processus
//   (SIGKILL) une fois que le serveur a *réellement* reçu la requête complète — la fenêtre de kill
//   est donc prouvée par un événement réseau réel, pas par un délai arbitraire.
// - "observateur-abandon" : lancé après la mort de la victime, sur la même identité de stockage,
//   avec une horloge décalée en avance de DELAI_ABANDON_REFRESH_MS + 1000 ms (`decalageMs`). Le
//   marqueur `refreshing` écrit par la victime est donc vu comme dépassé par cette horloge, ce qui
//   fait passer par la branche `abandonne` de 07 §3 (jamais par une deadline d'appel expirée) :
//   AUTH_REQUIRED avec le message d'abandon explicite, le stockage bascule en `reauth_required`,
//   et aucune requête n'est émise vers l'hôte identité.
// - "observateur-reauth" : lancé ensuite, horloge normale (`decalageMs` = 0). Le stockage est déjà
//   `reauth_required` (écrit par le rôle précédent) : AUTH_REQUIRED par la branche `reauth`, sans
//   aucune requête.
import { appendFile, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  DELAI_ABANDON_REFRESH_MS,
  assurerTokenValide,
  creerGestionnaireVerrous,
  creerOperationsFichierNode,
  creerStoreJson,
  creerTokenStoreFichier,
  nomVerrouIdentite,
} from "../../dist/index.js";

const [, , repertoire, port, mode, cheminResultat, cheminLogTransport] = process.argv;

const decalageMs = mode === "observateur-abandon" ? DELAI_ABANDON_REFRESH_MS + 1000 : 0;

const clock = {
  now: () => new Date(Date.now() + decalageMs),
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
    { budgetRestant: 30, deadline: new Date(clock.now().getTime() + deadlineMs) },
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
