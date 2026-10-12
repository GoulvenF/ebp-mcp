import { defineConfig } from "vitest/config";

// Garde réseau sur toute la suite (T14-1) : `globalSetup` pose le journal et `NODE_OPTIONS` pour
// les processus enfants, puis fait échouer la suite à la moindre tentative non loopback ;
// `setupFiles` installe la même garde dans chaque worker, quel que soit le pool (forks, threads).
export default defineConfig({
  test: {
    globalSetup: ["tests/garde/global-setup.ts"],
    setupFiles: ["tests/cli/garde-reseau.mjs"],
  },
});
