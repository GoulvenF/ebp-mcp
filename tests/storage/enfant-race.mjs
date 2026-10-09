#!/usr/bin/env node
// Processus enfant pour tests/storage/multi-processus.test.ts : deux instances concurrentes
// tentent de récupérer un verrou laissé par un détenteur mort prouvé (revue T04, point 1 — la
// récupération doit revendiquer exclusivement son action, jamais un `renommer` inconditionnel sur
// une lecture antérieure). Chaque enfant note sa détention dans un fichier d'occupation partagé et
// vérifie qu'aucun autre enfant n'y figure en même temps.
import { appendFile, readFile, writeFile } from "node:fs/promises";
import { creerGestionnaireVerrous, creerOperationsFichierNode } from "../../dist/index.js";

const [, , repertoireVerrou, id, cheminOccupation, cheminResultat] = process.argv;

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
const verrous = creerGestionnaireVerrous({ repertoire: repertoireVerrou, operations, clock });

async function main() {
  const deadline = new Date(Date.now() + 10000);
  const verrou = await verrous.acquire("quota", deadline);
  try {
    await appendFile(cheminOccupation, `${id}\n`, "utf8");
    // Fenêtre volontairement large : si la récupération avait volé le verrou d'un détenteur
    // vivant, un second enfant apparaîtrait ici pendant que celui-ci détient encore le verrou.
    await new Promise((resolve) => setTimeout(resolve, 80));
    const presents = (await readFile(cheminOccupation, "utf8")).trim().split("\n").filter(Boolean);
    await writeFile(
      cheminResultat,
      presents.length > 1 ? `COLLISION ${presents.join(",")}` : `SEUL ${id}`,
      "utf8",
    );
    await writeFile(cheminOccupation, "", "utf8");
  } finally {
    await verrou.release();
  }
}

main()
  .then(() => {
    process.stdout.write("ok\n");
  })
  .catch((erreur) => {
    console.error(erreur);
    process.exitCode = 1;
  });
