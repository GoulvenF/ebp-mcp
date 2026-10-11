import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  creerGestionnaireVerrous,
  creerOperationsFichierNode,
  type ContexteDossiers,
  type DepsDossiers,
  type DossiersParEnvironnement,
  type FichierConfig,
  type Identifiant,
} from "../../../dist/index.js";
import {
  creerHookTokenFactice,
  creerHorlogeControlee,
  creerQuotaFactice,
  creerTransportFactice,
  type ReponseFactice,
} from "../../http/fixtures.js";

export const TENANT_ID_1 = "11111111-1111-4111-8111-111111111111";
export const DOMAIN_ID_1 = "22222222-2222-4222-8222-222222222222";

const DEPART = new Date("2026-01-01T00:00:00.000Z");

export async function creerRepertoireTemporaire(): Promise<string> {
  return mkdtemp(join(tmpdir(), "ebp-mcp-services-dossiers-"));
}

export async function nettoyerRepertoire(chemin: string): Promise<void> {
  await rm(chemin, { recursive: true, force: true });
}

/** Fichier `config.json` minimal valide : un profil `default`, un dossier CPT déjà déclaré en prod. */
export function fichierTest(): FichierConfig {
  return {
    schemaVersion: 1,
    profiles: {
      default: {
        env: "prod",
        clientId: "client-defaut",
        redirectUri: "http://127.0.0.1:9000/callback",
        pkce: "required",
        enabledFamilies: ["hubbix-compta", "hubbix-gescom"],
        quotaGroup: "grp",
        dossiers: {
          prod: [{ alias: "dossier-prod", famille: "hubbix-compta", nom: null, tenantId: TENANT_ID_1 }],
          preprod: [],
        },
        defaultDossier: { prod: "dossier-prod" },
      },
    },
    quotaGroups: {
      grp: { maxPerDay: 10000, reserve: 500, minIntervalMs: 1000, resetTimezone: "Europe/Paris" },
    },
  } as unknown as FichierConfig;
}

export async function ecrireFichierInitial(chemin: string, fichier: FichierConfig = fichierTest()): Promise<void> {
  await writeFile(chemin, `${JSON.stringify(fichier, null, 2)}\n`, { mode: 0o600 });
}

export async function relireFichier(chemin: string): Promise<FichierConfig> {
  return JSON.parse(await readFile(chemin, "utf8")) as FichierConfig;
}

/** `DepsDossiers` complet au-dessus d'un transport factice compteur et d'un verrou/FS réels. */
export function depsDe(
  dir: string,
  reponses: ReponseFactice[] = [],
): DepsDossiers & { transport: ReturnType<typeof creerTransportFactice>; horloge: ReturnType<typeof creerHorlogeControlee> } {
  const clock = creerHorlogeControlee(DEPART);
  const transport = creerTransportFactice(reponses);
  return {
    http: {
      transport,
      clock,
      quota: creerQuotaFactice(clock),
      hookToken: creerHookTokenFactice({ accessToken: "acc-1", generation: 1 }),
    },
    verrous: creerGestionnaireVerrous({ repertoire: dir, operations: creerOperationsFichierNode(), clock }),
    operations: creerOperationsFichierNode(),
    transport,
    horloge: clock,
  };
}

export function ctxDe(dir: string, overrides: Partial<ContexteDossiers> = {}): ContexteDossiers {
  const dossiers: DossiersParEnvironnement = {
    prod: [{ alias: "dossier-prod" as Identifiant, famille: "hubbix-compta", id: TENANT_ID_1, nom: null }],
    preprod: [],
  };
  return {
    chemin: join(dir, "config.json"),
    profil: "default" as Identifiant,
    environnement: "prod",
    famillesActives: ["hubbix-compta", "hubbix-gescom"],
    dossiers,
    abonnementPourFamille: () => ({ cle: null, groupeQuota: "grp" as Identifiant }),
    deadline: new Date(DEPART.getTime() + 60_000),
    ...overrides,
  };
}
