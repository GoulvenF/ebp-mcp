#!/usr/bin/env node
// Processus enfant pour tests/quota/multi-processus.test.ts : importe dist/ comme un vrai
// consommateur du paquet, jamais les sources TypeScript directement (même motif que
// tests/storage/enfant-compteur.mjs, revue T04).
import { writeFile } from "node:fs/promises";
import {
  TYPE_QUOTA,
  creerGestionnaireVerrous,
  creerOperationsFichierNode,
  creerQuotaStoreFichier,
  creerStoreJson,
} from "../../dist/index.js";

const [, , racine, groupe, maxPerDay, reserve, minIntervalMs, nombreDeparts, cheminSortie] = process.argv;

/**
 * Décore le port `StoreJson` pour journaliser `dernierDepart` de chaque état écrit : c'est cet
 * instant, daté sous verrou avant l'écriture atomique + fsync + `release()` (décider, dans
 * `src/quota/quota-store-fichier.ts`), que l'espacement inter-processus garantit réellement — pas
 * le wall-clock mesuré après le retour de `reserveDepart`, qui inclut le coût variable d'E/S.
 */
function decorerAvecJournalDernierDepart(storeBase, instantsEcrits) {
  return {
    lire: (chemin, type) => storeBase.lire(chemin, type),
    async ecrire(chemin, type, valeur) {
      if (type === TYPE_QUOTA && valeur !== null && typeof valeur === "object" && typeof valeur.dernierDepart === "string") {
        instantsEcrits.push(Date.parse(valeur.dernierDepart));
      }
      return storeBase.ecrire(chemin, type, valeur);
    },
  };
}

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
const instantsEcrits = [];
const store = decorerAvecJournalDernierDepart(creerStoreJson({ operations }), instantsEcrits);
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
  // Son écriture journalise aussi un `dernierDepart` (instantsEcrits[0]), écarté ci-dessous.
  await quotaStore.reserveDepart(groupe, new Date(Date.now() + 30000));

  const total = Number.parseInt(nombreDeparts, 10);
  for (let i = 0; i < total; i += 1) {
    await quotaStore.reserveDepart(groupe, new Date(Date.now() + 30000));
  }
  // `instantsEcrits[0]` est l'échauffement ; chaque `reserveDepart` admis n'écrit qu'une fois
  // (mettreAJourSousVerrou n'appelle `ecrire` que si le transformateur ne lève pas), donc les
  // `total` entrées suivantes correspondent une à une aux départs mesurés, dans l'ordre.
  const instantsMesures = instantsEcrits.slice(1);
  await writeFile(cheminSortie, instantsMesures.join("\n") + "\n", "utf8");
}

main()
  .then(() => {
    process.stdout.write("ok\n");
  })
  .catch((erreur) => {
    console.error(erreur);
    process.exitCode = 1;
  });
