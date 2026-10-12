#!/usr/bin/env node
// Processus enfant pour tests/quota/profils-ab.test.ts (scénarios 2 et 3 de 09) : résout un profil
// *depuis un vrai config.json* (jamais un nom de groupe passé à la main) puis fait N admissions
// métier réelles via le quotaStore fichier partagé, exactement comme un vrai consommateur du
// paquet (import de dist/, jamais des sources TypeScript — même motif que enfant-depart.mjs).
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  TYPE_QUOTA,
  creerGestionnaireVerrous,
  creerOperationsFichierNode,
  creerQuotaStoreFichier,
  creerStoreJson,
  resoudreConfig,
} from "../../dist/index.js";

const [, , racine, nomProfil, nombreAdmissions, cheminSortieInstants, cheminSortieStatut, tenterSupplementaire] =
  process.argv;

/** Même technique que enfant-depart.mjs : journalise `dernierDepart` tel qu'écrit sous verrou. */
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

async function main() {
  const contenuFichier = await readFile(join(racine, "config.json"), "utf8");
  const journal = { avertir() {} };
  const config = resoudreConfig({
    contenuFichier,
    variablesEnv: {},
    cli: { profile: nomProfil },
    racine,
    journal,
  });
  // Groupe résolu depuis la configuration du profil, jamais tapé à la main par le test.
  const groupe = config.abonnementPourFamille("hubbix-compta").groupeQuota;

  const operations = creerOperationsFichierNode();
  const verrous = creerGestionnaireVerrous({ repertoire: racine, operations, clock });
  const instantsEcrits = [];
  const store = decorerAvecJournalDernierDepart(creerStoreJson({ operations }), instantsEcrits);
  const quotaStore = creerQuotaStoreFichier({ racine, groupesQuota: config.groupesQuota, verrous, store, clock });

  const total = Number.parseInt(nombreAdmissions, 10);
  for (let i = 0; i < total; i += 1) {
    await quotaStore.reserveDepart(groupe, new Date(Date.now() + 15000));
  }
  await writeFile(cheminSortieInstants, instantsEcrits.join("\n") + "\n", "utf8");

  const statutApres = await quotaStore.getStatut(groupe);
  const resultat = { groupe, statut: statutApres };

  if (tenterSupplementaire === "1") {
    try {
      await quotaStore.reserveDepart(groupe, new Date(Date.now() + 15000));
      resultat.supplementaire = { admis: true };
    } catch (erreur) {
      resultat.supplementaire = {
        admis: false,
        code: erreur?.erreur?.code ?? null,
        raison: erreur?.erreur?.details?.raison ?? null,
      };
    }
    resultat.statutApresSupplementaire = await quotaStore.getStatut(groupe);
  }

  await writeFile(cheminSortieStatut, JSON.stringify(resultat), "utf8");
}

main()
  .then(() => {
    process.stdout.write("ok\n");
  })
  .catch((erreur) => {
    console.error(erreur);
    process.exitCode = 1;
  });
