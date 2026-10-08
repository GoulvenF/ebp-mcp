import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // tests/storage/*.test.ts font cohabiter plusieurs suites qui tuent de vrais processus
    // enfants (fiche T04) : des fichiers de test exécutés en parallèle peuvent alors se voir
    // attribuer par l'OS le même pid qu'un enfant juste terminé d'un autre fichier, ce qui fausse
    // la détection de vivacité par `process.kill(pid, 0)`. Exécuter les fichiers séquentiellement
    // élimine cette collision sans affaiblir ce qui est testé (le comportement multi-processus
    // réel est conservé, seule la parallélisation entre fichiers de test est désactivée).
    fileParallelism: false,
  },
});
