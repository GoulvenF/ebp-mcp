#!/usr/bin/env node
// Processus enfant pour tests/storage/multi-processus.test.ts : importe dist/ comme un vrai
// consommateur du paquet, jamais les sources TypeScript directement.
import { writeFile } from "node:fs/promises";
import { creerGestionnaireVerrous, creerOperationsFichierNode, creerStoreJson } from "../../dist/index.js";

const [, , repertoireVerrou, cheminCompteur, mode, cheminMarqueur] = process.argv;

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
const store = creerStoreJson({ operations });

async function cycles(nombre) {
  for (let i = 0; i < nombre; i += 1) {
    const deadline = new Date(Date.now() + 20000);
    const verrou = await verrous.acquire("quota", deadline);
    try {
      const actuel = await store.lire(cheminCompteur, "compteur");
      const valeur = (actuel?.valeur ?? 0) + 1;
      await store.ecrire(cheminCompteur, "compteur", { valeur });
    } finally {
      await verrou.release();
    }
  }
}

async function retenirPuisBloquer() {
  const deadline = new Date(Date.now() + 20000);
  await verrous.acquire("quota", deadline);
  await store.ecrire(cheminCompteur, "compteur", { valeur: 1 });
  if (cheminMarqueur !== undefined) {
    await writeFile(cheminMarqueur, String(process.pid), "utf8");
  }
  // Volontairement jamais de release() : ce processus est destiné à être SIGKILLé pendant qu'il
  // détient le verrou, pour prouver la récupération après mort prouvée du détenteur.
  //
  // Revue T04 (2ᵉ passe) : une Promise jamais résolue, seule, ne retient aucun handle de la boucle
  // d'événements Node — le process sortait de lui-même en code 0 juste après avoir écrit le
  // marqueur, et le test SIGKILL ne tuait donc jamais aucun détenteur vivant. Un minuteur répété et
  // non `unref()` retient explicitement le processus en vie jusqu'au signal.
  await new Promise(() => {
    setInterval(() => {
      /* ne fait rien : seule sa présence retient la boucle d'événements */
    }, 60000);
  });
}

async function main() {
  if (mode === "retenir") {
    await retenirPuisBloquer();
    return;
  }
  const correspondance = /^cycles:(\d+)$/.exec(mode ?? "");
  if (correspondance === null) {
    throw new Error(`Mode inconnu : ${mode}`);
  }
  await cycles(Number.parseInt(correspondance[1], 10));
}

main()
  .then(() => {
    process.stdout.write("ok\n");
  })
  .catch((erreur) => {
    console.error(erreur);
    process.exitCode = 1;
  });
