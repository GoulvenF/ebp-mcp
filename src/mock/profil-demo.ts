/**
 * Profil de démo intégré SYNTHÉTIQUE (T13-1) : `FichierConfig` en mémoire (`src/config/schema.ts`)
 * référençant les deux dossiers synthétiques de `examples/config.demo.json` (GUID identiques, ne
 * jamais les recopier de mémoire ailleurs que depuis ce fichier source). `clientId` est un GUID
 * factice, jamais un identifiant EBP réel.
 */
import type { FichierConfig } from "../config/schema.js";
import { DOMAIN_ID_DEMO_GC } from "./donnees/gc.js";
import { TENANT_ID_DEMO_CPT } from "./donnees/cpt.js";

/** GUID factice, jamais émis par EBP (synthétique, démonstration uniquement). */
export const CLIENT_ID_DEMO = "99999999-9999-4999-8999-999999999999";

export const PROFIL_DEMO: FichierConfig = {
  schemaVersion: 1,
  profiles: {
    demo: {
      env: "prod",
      clientId: CLIENT_ID_DEMO,
      redirectUri: "http://127.0.0.1:8732/callback",
      pkce: "required",
      enabledFamilies: ["hubbix-compta", "hubbix-gescom"],
      quotaGroup: "demo",
      dossiers: {
        prod: [
          { alias: "demo-cpt", famille: "hubbix-compta", nom: "Démo Compta (synthétique)", tenantId: TENANT_ID_DEMO_CPT },
          { alias: "demo-gc", famille: "hubbix-gescom", nom: "Démo GesCom (synthétique)", domainId: DOMAIN_ID_DEMO_GC },
        ],
        preprod: [],
      },
      defaultDossier: {
        prod: "demo-cpt",
      },
    },
  },
  quotaGroups: {
    demo: {
      maxPerDay: 10000,
      reserve: 500,
      minIntervalMs: 0,
      resetTimezone: "Europe/Paris",
    },
  },
};
