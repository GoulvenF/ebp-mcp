#!/usr/bin/env node
// Processus enfant pour tests/quota/multi-processus.test.ts : importe dist/ comme un vrai
// consommateur du paquet, jamais les sources TypeScript directement (même motif que
// tests/storage/enfant-compteur.mjs, revue T04).
import { writeFile } from "node:fs/promises";
import {
  creerGestionnaireVerrous,
  creerOperationsFichierNode,
  creerQuotaStoreFichier,
  creerStoreJson,
} from "../../dist/index.js";

const [, , racine, groupe, maxPerDay, reserve, minIntervalMs, nombreDeparts, cheminSortie] = process.argv;

/** Horloge réelle minimale, sans dépendance aux fixtures de test (processus isolé). */
const clock = {
  now: () => new Date(),
  wait: (duree, signal) =>
    new Promise((resolve) => {
      if (signal?.aborted === true) {
        resolve();
        return;
      }
      const minuteur = setTimeout(resolve, duree);
      signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(minuteur);
          resolve();
        },
        { once: true },
      );
    }),
};

const operations = creerOperationsFichierNode();
const verrous = creerGestionnaireVerrous({ repertoire: racine, operations, clock });
const store = creerStoreJson({ operations });
const groupesQuota = new Map([
  [
    groupe,
    {
      maxPerDay: Number.parseInt(maxPerDay, 10),
      reserve: Number.parseInt(reserve, 10),
      minIntervalMs: Number.parseInt(minIntervalMs, 10),
      resetTimezone: "Europe/Paris",
    },
  ],
]);
const quotaStore = creerQuotaStoreFichier({ racine, groupesQuota, verrous, store, clock });

async function main() {
  // Échauffement non mesuré : crée le répertoire/fichier d'état avant la mesure, pour que son
  // coût ponctuel (mkdir) ne fausse pas l'écart mesuré entre les deux premiers départs mesurés.
  await quotaStore.reserveDepart(groupe, new Date(Date.now() + 30000));

  const instants = [];
  const total = Number.parseInt(nombreDeparts, 10);
  for (let i = 0; i < total; i += 1) {
    await quotaStore.reserveDepart(groupe, new Date(Date.now() + 30000));
    instants.push(Date.now());
  }
  await writeFile(cheminSortie, instants.join("\n") + "\n", "utf8");
}

main()
  .then(() => {
    process.stdout.write("ok\n");
  })
  .catch((erreur) => {
    console.error(erreur);
    process.exitCode = 1;
  });
