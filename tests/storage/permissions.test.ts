import { stat } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { creerOperationsFichierNode, creerStoreJson, type OperationsFichier } from "../../dist/index.js";
import { creerRepertoireTemporaire, nettoyerRepertoire } from "./fixtures.js";

/** Observe le mode du fichier temporaire juste après sa création, avant l'écriture des données. */
function avecObservationModeTemporaire(
  base: OperationsFichier,
): { operations: OperationsFichier; modeObserve: () => number | null } {
  let modeObserve: number | null = null;
  let cheminTemporaire: string | null = null;
  const operations: OperationsFichier = {
    ...base,
    async ouvrirExclusif(chemin, mode) {
      cheminTemporaire = chemin;
      return base.ouvrirExclusif(chemin, mode);
    },
    async ecrireTout(descripteur, donnees) {
      if (cheminTemporaire !== null) {
        const stats = await stat(cheminTemporaire);
        modeObserve = stats.mode & 0o777;
      }
      return base.ecrireTout(descripteur, donnees);
    },
  };
  return { operations, modeObserve: () => modeObserve };
}

describe.skipIf(process.platform === "win32")("permissions.ts (POSIX)", () => {
  let dir: string;
  let umaskPrecedent: number;

  beforeEach(async () => {
    dir = await creerRepertoireTemporaire();
    umaskPrecedent = process.umask(0o000);
  });

  afterEach(async () => {
    process.umask(umaskPrecedent);
    await nettoyerRepertoire(dir);
  });

  it("répertoire 0700, fichier final 0600, mode du temporaire déjà restreint avant écriture", async () => {
    const chemin = join(dir, "sous-repertoire", "etat.json");
    const { operations, modeObserve } = avecObservationModeTemporaire(creerOperationsFichierNode());
    const store = creerStoreJson({ operations });

    await store.ecrire(chemin, "compteur", { valeur: 1 });

    const statsRepertoire = await stat(join(dir, "sous-repertoire"));
    expect(statsRepertoire.mode & 0o777).toBe(0o700);

    const statsFichier = await stat(chemin);
    expect(statsFichier.mode & 0o777).toBe(0o600);

    const mode = modeObserve();
    expect(mode).not.toBeNull();
    expect((mode as number) & 0o077).toBe(0);
  });
});
