// Garde réseau globale de `npm test` (T14-1, livrable « CI sans réseau EBP »). Ce `globalSetup`
// tourne dans le processus principal de vitest, avant le lancement des workers :
// - il crée un journal de tentatives propre à l'exécution et le désigne par
//   `EBP_MCP_TEST_GARDE_FICHIER` ;
// - il ajoute `--import=<garde-reseau.mjs>` à `NODE_OPTIONS`, hérité par les workers et par tout
//   processus Node qu'un test lance avec l'environnement courant (`spawn`, `fork`, `spawnSync`) ;
// - au teardown, il fait échouer la suite si le journal contient la moindre tentative non loopback,
//   cibles comprises dans le message. Une erreur avalée par le code testé ne masque donc rien.
// Les workers chargent aussi la garde par `setupFiles` (voir `vitest.config.ts`), quel que soit le pool.
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { GARDE_RESEAU } from "../cli/fixtures.js";

export default async function installerGardeGlobale(): Promise<() => Promise<void>> {
  const repertoire = await mkdtemp(join(tmpdir(), "ebp-mcp-garde-globale-"));
  const journal = join(repertoire, "tentatives.log");
  const precedent = { fichier: process.env.EBP_MCP_TEST_GARDE_FICHIER, nodeOptions: process.env.NODE_OPTIONS };

  process.env.EBP_MCP_TEST_GARDE_FICHIER = journal;
  const importGarde = `--import=${pathToFileURL(GARDE_RESEAU).href}`;
  const options = process.env.NODE_OPTIONS ?? "";
  if (!options.includes(importGarde)) {
    process.env.NODE_OPTIONS = options === "" ? importGarde : `${options} ${importGarde}`;
  }

  return async () => {
    const tentatives = await lireJournal(journal);
    await rm(repertoire, { recursive: true, force: true });
    restaurer("EBP_MCP_TEST_GARDE_FICHIER", precedent.fichier);
    restaurer("NODE_OPTIONS", precedent.nodeOptions);
    if (tentatives.length > 0) {
      process.exitCode = 1;
      throw new Error(
        `Garde réseau : ${tentatives.length} tentative(s) d'émission non loopback pendant les tests : ` +
          tentatives.join(", "),
      );
    }
  };
}

async function lireJournal(chemin: string): Promise<string[]> {
  try {
    return (await readFile(chemin, "utf8")).split("\n").filter((l) => l.length > 0);
  } catch (erreur) {
    if ((erreur as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw erreur;
  }
}

function restaurer(nom: string, valeur: string | undefined): void {
  if (valeur === undefined) delete process.env[nom];
  else process.env[nom] = valeur;
}
