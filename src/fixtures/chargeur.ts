import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { ManifesteFixture, MarqueurCouverture } from "./manifeste.js";
import { ManifesteFixtureSchema } from "./manifeste.js";

/**
 * Charge et valide chaque `*.json` de `repertoire` (07 §1 : aucun chemin codé en dur ici, le
 * répertoire est fourni par l'appelant — `tests/corpus/ebp/` en test, autre chose pour T09/T10).
 * Échoue bruyamment en nommant le fichier fautif ; aucun `try/catch` ne transforme une fixture
 * invalide en liste vide.
 */
export function chargerCorpus(repertoire: string): ManifesteFixture[] {
  const fichiers = readdirSync(repertoire)
    .filter((nom) => nom.endsWith(".json"))
    .sort();

  const corpus: ManifesteFixture[] = [];
  const idsVus = new Map<string, string>();

  for (const fichier of fichiers) {
    const chemin = join(repertoire, fichier);
    const contenu = readFileSync(chemin, "utf8");

    let donnees: unknown;
    try {
      donnees = JSON.parse(contenu);
    } catch (erreur) {
      throw new Error(`Fixture invalide (JSON illisible) : ${chemin} — ${(erreur as Error).message}`);
    }

    const resultat = ManifesteFixtureSchema.safeParse(donnees);
    if (!resultat.success) {
      throw new Error(`Fixture invalide : ${chemin} — ${resultat.error.message}`);
    }

    const fichierPrecedent = idsVus.get(resultat.data.id);
    if (fichierPrecedent !== undefined) {
      throw new Error(
        `Identifiant de fixture dupliqué "${resultat.data.id}" : ${fichierPrecedent} et ${chemin}`,
      );
    }
    idsVus.set(resultat.data.id, chemin);

    corpus.push(resultat.data);
  }

  return corpus;
}

export function trouverParId(corpus: readonly ManifesteFixture[], id: string): ManifesteFixture | undefined {
  return corpus.find((fixture) => fixture.id === id);
}

export function filtrerParCouverture(
  corpus: readonly ManifesteFixture[],
  marqueur: MarqueurCouverture,
): ManifesteFixture[] {
  return corpus.filter((fixture) => fixture.couverture.includes(marqueur));
}
