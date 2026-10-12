import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { creerRepertoireTemporaire, nettoyerRepertoire } from "./fixtures.js";

const ICI = dirname(fileURLToPath(import.meta.url));
const SCRIPT_ENFANT = join(ICI, "enfant-admission-profil.mjs");

const MIN_INTERVAL_MS = 100;
const N = 3;
/** `maxPerDay - reserve` fixé à exactement `2 * N` : la réserve est atteinte pile après les
 * admissions des deux profils, sans marge, pour prouver le refus du départ suivant. */
const MAX_PER_DAY = 2 * N;
const RESERVE = 0;

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const DOMAIN_ID = "22222222-2222-4222-8222-222222222222";

interface GroupeQuotaBrut {
  maxPerDay: number;
  reserve: number;
  minIntervalMs: number;
  resetTimezone: string;
}

/** Profil valide minimal (schéma `schemaProfil`), un dossier CPT et un dossier GC, comme l'exige
 * l'interprétation « profil A/B » de l'issue. */
function profil(quotaGroup: string, aliasSuffixe: string): Record<string, unknown> {
  return {
    env: "prod",
    clientId: `client-${aliasSuffixe}`,
    redirectUri: "http://127.0.0.1:9100/callback",
    enabledFamilies: ["hubbix-compta", "hubbix-gescom"],
    quotaGroup,
    dossiers: {
      prod: [
        { alias: `cpt-${aliasSuffixe}`, famille: "hubbix-compta", nom: null, tenantId: TENANT_ID },
        { alias: `gc-${aliasSuffixe}`, famille: "hubbix-gescom", nom: null, domainId: DOMAIN_ID },
      ],
      preprod: [],
    },
    defaultDossier: { prod: `cpt-${aliasSuffixe}` },
  };
}

function groupeQuota(overrides?: Partial<GroupeQuotaBrut>): GroupeQuotaBrut {
  return {
    maxPerDay: MAX_PER_DAY,
    reserve: RESERVE,
    minIntervalMs: MIN_INTERVAL_MS,
    resetTimezone: "Europe/Paris",
    ...overrides,
  };
}

async function ecrireConfig(dir: string, profiles: Record<string, unknown>, quotaGroups: Record<string, unknown>): Promise<void> {
  await writeFile(
    join(dir, "config.json"),
    JSON.stringify({ schemaVersion: 1, profiles, quotaGroups }),
    "utf8",
  );
}

interface StatutQuota {
  quotaJourRestant: number;
  quotaUtilisable: number;
  quotaEstime: boolean;
}

interface ResultatEnfant {
  groupe: string;
  statut: StatutQuota;
  supplementaire?: { admis: boolean; code: string | null; raison: string | null };
  statutApresSupplementaire?: StatutQuota;
}

function lancerScript(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const enfant = spawn(process.execPath, [SCRIPT_ENFANT, ...args], { stdio: ["ignore", "pipe", "pipe"] });
    let erreurSortie = "";
    enfant.stderr.on("data", (donnees: Buffer) => {
      erreurSortie += donnees.toString();
    });
    enfant.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Enfant terminé avec le code ${code} : ${erreurSortie}`));
    });
    enfant.on("error", reject);
  });
}

describe("quota profils A/B (scénarios 2 et 3 de 09, 07 §4)", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await creerRepertoireTemporaire();
  });

  afterEach(async () => {
    await nettoyerRepertoire(dir);
  });

  it(
    "deux profils a/b résolus depuis config.json, même quotaGroup ⇒ espacement réel, compteur journalier partagé exactement 2N, vu identique par chaque profil, réserve atteinte refuse le départ suivant pour les deux profils",
    async () => {
      await ecrireConfig(
        dir,
        { a: profil("partage", "a"), b: profil("partage", "b") },
        { partage: groupeQuota() },
      );

      const sortieInstantsA = join(dir, "instants-a.txt");
      const sortieStatutA = join(dir, "statut-a.json");
      const sortieInstantsB = join(dir, "instants-b.txt");
      const sortieStatutB = join(dir, "statut-b.json");

      await Promise.all([
        lancerScript([dir, "a", String(N), sortieInstantsA, sortieStatutA, "0"]),
        lancerScript([dir, "b", String(N), sortieInstantsB, sortieStatutB, "0"]),
      ]);

      // Aucun couple de départs à moins de minIntervalMs, tous profils confondus.
      const instants = [
        ...(await readFile(sortieInstantsA, "utf8")).trim().split("\n").map(Number),
        ...(await readFile(sortieInstantsB, "utf8")).trim().split("\n").map(Number),
      ].sort((x, y) => x - y);
      expect(instants).toHaveLength(2 * N);
      for (let i = 1; i < instants.length; i += 1) {
        const ecart = (instants[i] as number) - (instants[i - 1] as number);
        expect(ecart).toBeGreaterThanOrEqual(MIN_INTERVAL_MS);
      }

      // Compteur journalier persisté exactement 2N, vu identique par chaque profil : relecture
      // seulement une fois les deux processus d'admission terminés (le statut écrit par chacun en
      // fin de sa propre boucle ne reflète que son avancement local pendant que l'autre tourne
      // encore ; ici on relit après le `Promise.all`, avec 0 admission supplémentaire, pour un
      // instantané stable du compteur partagé). Réserve atteinte ⇒ quotaJourRestant ==
      // quotaUtilisable == 0 (reserve == 0 ici).
      const sortieInstantsALecture = join(dir, "instants-a-lecture.txt");
      const sortieStatutALecture = join(dir, "statut-a-lecture.json");
      const sortieInstantsBLecture = join(dir, "instants-b-lecture.txt");
      const sortieStatutBLecture = join(dir, "statut-b-lecture.json");
      await lancerScript([dir, "a", "0", sortieInstantsALecture, sortieStatutALecture, "0"]);
      await lancerScript([dir, "b", "0", sortieInstantsBLecture, sortieStatutBLecture, "0"]);
      const resultatA = JSON.parse(await readFile(sortieStatutALecture, "utf8")) as ResultatEnfant;
      const resultatB = JSON.parse(await readFile(sortieStatutBLecture, "utf8")) as ResultatEnfant;
      expect(resultatA.groupe).toBe("partage");
      expect(resultatB.groupe).toBe("partage");
      expect(resultatA.statut).toEqual({ quotaJourRestant: 0, quotaUtilisable: 0, quotaEstime: true });
      expect(resultatB.statut).toEqual(resultatA.statut);

      // Réserve atteinte : le processus suivant ne fait aucun départ supplémentaire, quel que soit
      // son profil (a puis b, séquentiellement pour ne pas changer le compteur entre les deux).
      const sortieInstantsASupp = join(dir, "instants-a-supp.txt");
      const sortieStatutASupp = join(dir, "statut-a-supp.json");
      await lancerScript([dir, "a", "0", sortieInstantsASupp, sortieStatutASupp, "1"]);
      const resultatASupp = JSON.parse(await readFile(sortieStatutASupp, "utf8")) as ResultatEnfant;
      expect(resultatASupp.supplementaire).toEqual({ admis: false, code: "RESOLUTION_INCOMPLETE", raison: "quota" });
      expect(resultatASupp.statutApresSupplementaire).toEqual({ quotaJourRestant: 0, quotaUtilisable: 0, quotaEstime: true });

      const sortieInstantsBSupp = join(dir, "instants-b-supp.txt");
      const sortieStatutBSupp = join(dir, "statut-b-supp.json");
      await lancerScript([dir, "b", "0", sortieInstantsBSupp, sortieStatutBSupp, "1"]);
      const resultatBSupp = JSON.parse(await readFile(sortieStatutBSupp, "utf8")) as ResultatEnfant;
      expect(resultatBSupp.supplementaire).toEqual({ admis: false, code: "RESOLUTION_INCOMPLETE", raison: "quota" });
    },
    MIN_INTERVAL_MS * (2 * N + 10) * 3 + 20000,
  );

  it(
    "deux profils c/d résolus depuis config.json, groupes de quota distincts (témoin) ⇒ compteurs indépendants",
    async () => {
      await ecrireConfig(
        dir,
        { c: profil("groupe-c", "c"), d: profil("groupe-d", "d") },
        { "groupe-c": groupeQuota({ maxPerDay: 10, reserve: 0 }), "groupe-d": groupeQuota({ maxPerDay: 10, reserve: 0 }) },
      );

      const sortieInstantsC = join(dir, "instants-c.txt");
      const sortieStatutC = join(dir, "statut-c.json");
      const sortieInstantsD = join(dir, "instants-d.txt");
      const sortieStatutD = join(dir, "statut-d.json");

      // N admissions pour c, 2N pour d : si les groupes partageaient un compteur, le statut de c
      // refléterait aussi les départs de d.
      await Promise.all([
        lancerScript([dir, "c", String(N), sortieInstantsC, sortieStatutC, "0"]),
        lancerScript([dir, "d", String(2 * N), sortieInstantsD, sortieStatutD, "0"]),
      ]);

      const resultatC = JSON.parse(await readFile(sortieStatutC, "utf8")) as ResultatEnfant;
      const resultatD = JSON.parse(await readFile(sortieStatutD, "utf8")) as ResultatEnfant;
      expect(resultatC.groupe).toBe("groupe-c");
      expect(resultatD.groupe).toBe("groupe-d");
      expect(resultatC.statut).toEqual({ quotaJourRestant: 10 - N, quotaUtilisable: 10 - N, quotaEstime: true });
      expect(resultatD.statut).toEqual({ quotaJourRestant: 10 - 2 * N, quotaUtilisable: 10 - 2 * N, quotaEstime: true });
    },
    MIN_INTERVAL_MS * (2 * N + 10) * 2 + 20000,
  );
});
