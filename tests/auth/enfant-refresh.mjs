#!/usr/bin/env node
// Processus enfant pour tests/auth/multi-processus.test.ts (critère #8) : plusieurs instances
// réelles de Node, sur la même identité de stockage (même répertoire), tentent de rafraîchir un
// token expiré en même temps. Chaque échange réseau simulé journalise une ligne dans un fichier
// partagé : la preuve attendue est qu'une seule ligne apparaît au total, quel que soit le nombre
// d'enfants, et que tous terminent sur la même génération `ready`.
import { appendFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  assurerTokenValide,
  creerGestionnaireVerrous,
  creerOperationsFichierNode,
  creerStoreJson,
  creerTokenStoreFichier,
  nomVerrouIdentite,
} from "../../dist/index.js";

const [, , repertoire, cheminLogEchanges, cheminResultat] = process.argv;

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

const identite = { profil: "default", environnement: "prod", empreinteClientId: "empreinte-multi" };
const operations = creerOperationsFichierNode();
const verrous = creerGestionnaireVerrous({ repertoire, operations, clock });
const store = creerStoreJson({ operations });
const cheminGenerations = join(repertoire, "generations.json");
const cheminTokens = join(repertoire, "tokens.json");
const tokenStore = creerTokenStoreFichier({ chemin: cheminTokens, store, operations });
const nomVerrou = nomVerrouIdentite(`${identite.profil}.${identite.environnement}.${identite.empreinteClientId}`);

/** Transport factice : journalise chaque échange réel dans le fichier partagé, puis répond 200. */
const transport = {
  async request(spec) {
    await appendFile(cheminLogEchanges, `${process.pid} ${spec.method} ${spec.url}\n`, "utf8");
    return {
      status: 200,
      headers: {},
      body: JSON.stringify({
        access_token: `access-${process.pid}`,
        refresh_token: `refresh-${process.pid}`,
        expires_in: 3600,
      }),
    };
  },
};

async function main() {
  const resultat = await assurerTokenValide(
    { transport, clock, verrous, store, tokenStore, identite, nomVerrou, cheminGenerations, profilAuth: { clientId: "client-multi" } },
    { budgetRestant: 30, deadline: new Date(Date.now() + 15000) },
  );
  const enregistrementFinal = await tokenStore.read(identite);
  await writeFile(
    cheminResultat,
    JSON.stringify({ accessToken: resultat.accessToken, generation: enregistrementFinal.generation, state: enregistrementFinal.state }),
    "utf8",
  );
}

main()
  .then(() => {
    process.stdout.write("ok\n");
  })
  .catch((erreur) => {
    console.error(erreur);
    process.exitCode = 1;
  });
