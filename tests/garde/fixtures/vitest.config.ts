import { defineConfig, mergeConfig } from "vitest/config";
import configRacine from "../../../vitest.config.js";

// Configuration des exécutions imbriquées de `tests/garde/garde-globale.test.ts` : la garde de la
// suite réelle (même `globalSetup`, mêmes `setupFiles`), restreinte à un fichier `*.fixture.ts`
// que la suite principale n'inclut pas (motif par défaut `*.test.ts`).
export default mergeConfig(
  configRacine,
  defineConfig({ test: { include: ["tests/garde/fixtures/*.fixture.ts"] } }),
);
