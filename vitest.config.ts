import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Revue T04 : repris après re-mesure demandée en revue. La correction des points 1/2
    // (verrou.ts) élimine la vraie course ; sous charge CPU réelle (hôte de build partagé),
    // `tests/storage/multi-processus.test.ts` tue de vrais processus enfants et attend leur
    // événement `exit`, ce qui redevient instable dès que ~20 autres fichiers de test
    // s'exécutent en parallèle et se disputent le CPU — reproduit de façon déterministe sur cet
    // hôte, y compris sur le test SIGKILL préexistant non modifié par cette révision. Exécuter
    // les fichiers séquentiellement élimine cette contention sans affaiblir ce qui est testé :
    // le comportement multi-processus réel (vrais processus, vrai SIGKILL) est conservé, seule
    // la parallélisation entre fichiers de test est désactivée.
    fileParallelism: false,
  },
});
