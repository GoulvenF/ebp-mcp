import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { EntreesResolution, Journal, OptionsCli, VariablesEnv } from "../../dist/config/index.js";

/** Répertoire temporaire sous un préfixe propre, nettoyé par le test appelant. */
export async function creerRepertoireTemporaire(): Promise<string> {
  return mkdtemp(join(tmpdir(), "ebp-mcp-config-"));
}

export async function nettoyerRepertoire(chemin: string): Promise<void> {
  await rm(chemin, { recursive: true, force: true });
}

export function journalEspion(): Journal & { readonly messages: string[] } {
  const messages: string[] = [];
  return {
    avertir(message: string): void {
      messages.push(message);
    },
    messages,
  };
}

export const TENANT_ID_DEMO = "11111111-1111-4111-8111-111111111111";
export const DOMAIN_ID_DEMO = "22222222-2222-4222-8222-222222222222";
export const DOMAIN_ID_PREPROD = "33333333-3333-4333-8333-333333333333";

/** Fichier `config.json` minimal valide, un seul profil `default`, un groupe de quota `grp`. */
export function fichierBase(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    profiles: {
      default: {
        env: "prod",
        clientId: "client-defaut",
        redirectUri: "http://127.0.0.1:9000/callback",
        enabledFamilies: ["hubbix-compta", "hubbix-gescom"],
        quotaGroup: "grp",
        dossiers: {
          prod: [
            { alias: "dossier-prod", famille: "hubbix-compta", nom: null, tenantId: TENANT_ID_DEMO },
          ],
          preprod: [
            { alias: "dossier-preprod", famille: "hubbix-gescom", nom: null, domainId: DOMAIN_ID_PREPROD },
          ],
        },
        defaultDossier: { prod: "dossier-prod", preprod: "dossier-preprod" },
      },
    },
    quotaGroups: {
      grp: { maxPerDay: 10000, reserve: 500, minIntervalMs: 1000, resetTimezone: "Europe/Paris" },
    },
  };
}

export function entreesBase(overrides?: {
  fichier?: Record<string, unknown> | null;
  variablesEnv?: VariablesEnv;
  cli?: OptionsCli;
  racine?: string;
  journal?: Journal;
}): EntreesResolution {
  const fichier = overrides?.fichier === undefined ? fichierBase() : overrides.fichier;
  return {
    contenuFichier: fichier === null ? null : JSON.stringify(fichier),
    variablesEnv: overrides?.variablesEnv ?? {},
    cli: overrides?.cli ?? {},
    racine: overrides?.racine ?? "/config-racine",
    journal: overrides?.journal ?? journalEspion(),
  };
}
