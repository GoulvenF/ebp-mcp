import { readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  creerGestionnaireVerrous,
  creerOperationsFichierNode,
  creerQuotaStoreFichier,
  creerStoreJson,
  ErreurQuota,
  ErreurStockage,
  type GroupeQuota,
  type Identifiant,
  type OperationsFichier,
  type QuotaStore,
} from "../../dist/index.js";
import { avecEchecSiPredicat, creerHorlogePilotee, creerRepertoireTemporaire, nettoyerRepertoire, type HorlogePilotee } from "./fixtures.js";

function config(partiel: Partial<GroupeQuota> = {}): GroupeQuota {
  return {
    maxPerDay: 10000,
    reserve: 500,
    minIntervalMs: 1000,
    resetTimezone: "Europe/Paris",
    ...partiel,
  };
}

function construire(
  dir: string,
  clock: HorlogePilotee,
  groupes: Record<string, GroupeQuota>,
  operations: OperationsFichier = creerOperationsFichierNode(),
): QuotaStore {
  const verrous = creerGestionnaireVerrous({ repertoire: dir, operations, clock });
  const store = creerStoreJson({ operations });
  const groupesQuota = new Map(Object.entries(groupes)) as unknown as ReadonlyMap<Identifiant, GroupeQuota>;
  return creerQuotaStoreFichier({ racine: dir, groupesQuota, verrous, store, clock });
}

const LOIN = (clock: HorlogePilotee): Date => new Date(clock.now().getTime() + 60000);

describe("quota-store-fichier.ts (fiche T05, 07 §4)", () => {
  let dir: string;
  let clock: HorlogePilotee;

  beforeEach(async () => {
    dir = await creerRepertoireTemporaire();
    clock = creerHorlogePilotee(new Date("2026-03-10T10:00:00.000Z"));
  });

  afterEach(async () => {
    await nettoyerRepertoire(dir);
  });

  describe("critère 2 — groupes distincts indépendants", () => {
    it("un groupe en cooldown n'allonge pas l'admission d'un autre groupe", async () => {
      const qs = construire(dir, clock, { a: config({ minIntervalMs: 0 }), b: config({ minIntervalMs: 0 }) });
      await qs.enregistrerCooldown429("a", new Date(clock.now().getTime() + 50000));

      // Le groupe "b" n'est pas affecté : admission immédiate, aucune attente d'espacement/cooldown.
      await qs.reserveDepart("b", LOIN(clock));
      expect(clock.signauxAttentes().filter((signal) => signal === undefined)).toHaveLength(0);
    });
  });

  describe("critère 3 — aucun burst après réveil tardif", () => {
    it("un saut d'horloge pendant l'attente n'admet qu'un seul départ, pas une rafale", async () => {
      const qs = construire(dir, clock, { g: config({ minIntervalMs: 1000, reserve: 0 }) });

      await qs.reserveDepart("g", LOIN(clock)); // départ 1, immédiat
      const p2 = qs.reserveDepart("g", LOIN(clock)); // départ 2, doit attendre ~1000 ms

      await clock.avancerDe(5000); // réveil tardif : saute 5× l'espacement minimal
      await p2;

      const statutApres2 = await qs.getStatut("g");
      expect(statutApres2.quotaJourRestant).toBe(10000 - 2); // un seul départ admis par le saut

      // Un troisième départ demandé juste après ne peut pas partir immédiatement : l'horloge a
      // sauté, mais le dernier départ réel vient d'être réenregistré à l'instant du réveil.
      let p3Resolu = false;
      const p3 = qs.reserveDepart("g", LOIN(clock)).then(() => {
        p3Resolu = true;
      });
      await clock.avancerDe(999);
      expect(p3Resolu).toBe(false);
      await clock.avancerDe(2);
      await p3;
      expect(p3Resolu).toBe(true);
    });
  });

  describe("critère 4 — réserve", () => {
    it(
      "maxPerDay=10000, reserve=500 ⇒ 9500 réservations acceptées, la 9501ᵉ refusée sans mutation",
      async () => {
        const qs = construire(dir, clock, { g: config({ minIntervalMs: 0, maxPerDay: 10000, reserve: 500 }) });

        for (let i = 0; i < 9500; i += 1) {
          await qs.reserveDepart("g", LOIN(clock));
        }
        const statutAvant = await qs.getStatut("g");
        expect(statutAvant.quotaUtilisable).toBe(0);
        expect(statutAvant.quotaJourRestant).toBe(500);

        await expect(qs.reserveDepart("g", LOIN(clock))).rejects.toMatchObject({
          erreur: { code: "RESOLUTION_INCOMPLETE", details: { raison: "quota" } },
        });

        const statutApres = await qs.getStatut("g");
        expect(statutApres.quotaJourRestant).toBe(500); // inchangé par le refus
      },
      30000,
    );
  });

  describe("critère 5 — rollover Europe/Paris", () => {
    it("minuit Paris (23:59:59.999 → 00:00:00) ⇒ un seul reset, compteur et dernierDepart repartis proprement", async () => {
      const avantMinuit = creerHorlogePilotee(new Date("2026-01-15T22:59:59.999Z")); // Paris 23:59:59.999 (hiver, UTC+1)
      const qs = construire(dir, avantMinuit, { g: config({ minIntervalMs: 0 }) });

      await qs.reserveDepart("g", LOIN(avantMinuit));
      expect((await qs.getStatut("g")).quotaJourRestant).toBe(10000 - 1);

      await avantMinuit.avancerA(new Date("2026-01-15T23:00:00.000Z")); // Paris 2026-01-16T00:00:00.000
      await qs.reserveDepart("g", LOIN(avantMinuit));
      // Un seul reset : le compteur repart de zéro puis prend 1, pas 2.
      expect((await qs.getStatut("g")).quotaJourRestant).toBe(10000 - 1);

      // Pas de second reset si on relit la même journée civile juste après.
      expect((await qs.getStatut("g")).quotaJourRestant).toBe(10000 - 1);
    });
  });

  describe("critère 6 — changements DST", () => {
    it("2026-03-29 (heure manquante) : pas de reset pendant le changement d'heure, un seul au vrai minuit", async () => {
      const printemps = creerHorlogePilotee(new Date("2026-03-29T00:30:00.000Z")); // Paris 01:30 CET
      const qs = construire(dir, printemps, { g: config({ minIntervalMs: 0 }) });

      await qs.reserveDepart("g", LOIN(printemps)); // jour 29, consomme=1
      await printemps.avancerA(new Date("2026-03-29T01:30:00.000Z")); // Paris 03:30 CEST (heure 02h-03h absente)
      await qs.reserveDepart("g", LOIN(printemps)); // toujours jour 29 ⇒ pas de reset
      expect((await qs.getStatut("g")).quotaJourRestant).toBe(10000 - 2);

      await printemps.avancerA(new Date("2026-03-29T21:59:59.999Z")); // Paris 23:59:59.999 CEST, jour 29
      await qs.reserveDepart("g", LOIN(printemps));
      expect((await qs.getStatut("g")).quotaJourRestant).toBe(10000 - 3);

      await printemps.avancerA(new Date("2026-03-29T22:00:00.000Z")); // Paris 2026-03-30T00:00:00 CEST ⇒ reset
      await qs.reserveDepart("g", LOIN(printemps));
      expect((await qs.getStatut("g")).quotaJourRestant).toBe(10000 - 1);

      await printemps.avancerA(new Date("2026-03-29T22:00:01.000Z")); // toujours jour 30 ⇒ pas de second reset
      await qs.reserveDepart("g", LOIN(printemps));
      expect((await qs.getStatut("g")).quotaJourRestant).toBe(10000 - 2);
    });

    it("2026-10-25 (heure répétée) : pas de double reset pendant l'heure répétée, pas de reset manqué", async () => {
      const automne = creerHorlogePilotee(new Date("2026-10-25T00:30:00.000Z")); // Paris 02:30 CEST
      const qs = construire(dir, automne, { g: config({ minIntervalMs: 0 }) });

      await qs.reserveDepart("g", LOIN(automne)); // jour 25, consomme=1
      await automne.avancerA(new Date("2026-10-25T01:30:00.000Z")); // Paris 02:30 CET (heure répétée)
      await qs.reserveDepart("g", LOIN(automne)); // toujours jour 25 ⇒ pas de reset
      expect((await qs.getStatut("g")).quotaJourRestant).toBe(10000 - 2);

      await automne.avancerA(new Date("2026-10-25T22:59:59.999Z")); // Paris 23:59:59.999 CET, jour 25
      await qs.reserveDepart("g", LOIN(automne));
      expect((await qs.getStatut("g")).quotaJourRestant).toBe(10000 - 3);

      await automne.avancerA(new Date("2026-10-25T23:00:00.000Z")); // Paris 2026-10-26T00:00:00 CET ⇒ reset
      await qs.reserveDepart("g", LOIN(automne));
      expect((await qs.getStatut("g")).quotaJourRestant).toBe(10000 - 1);

      await automne.avancerA(new Date("2026-10-25T23:00:01.000Z")); // toujours jour 26 ⇒ pas de second reset
      await qs.reserveDepart("g", LOIN(automne));
      expect((await qs.getStatut("g")).quotaJourRestant).toBe(10000 - 2);
    });
  });

  describe("critère 7 — horloge reculante", () => {
    it("aucun reset anticipé, aucun départ anticipé", async () => {
      const qs = construire(dir, clock, { g: config({ minIntervalMs: 1000 }) });

      // T1 = 2026-03-15T10:00:00Z (Paris 2026-03-15).
      await clock.avancerA(new Date("2026-03-15T10:00:00.000Z"));
      await qs.reserveDepart("g", LOIN(clock));
      const statutT1 = await qs.getStatut("g");

      // Horloge reculée à T0, jour civil Paris antérieur (2026-03-14).
      await clock.avancerA(new Date("2026-03-14T09:00:00.000Z"));
      const statutT0 = await qs.getStatut("g");
      expect(statutT0).toEqual(statutT1); // aucun reset anticipé

      // Aucun départ anticipé : la deadline proche (10 ms) ne suffit pas à couvrir l'attente
      // (très grande, puisque l'horloge a reculé d'un jour entier par rapport à dernierDepart).
      const deadlineProche = new Date(clock.now().getTime() + 10);
      await expect(qs.reserveDepart("g", deadlineProche)).rejects.toMatchObject({
        erreur: { code: "RESOLUTION_INCOMPLETE", details: { raison: "deadline" } },
      });
      expect(clock.signauxAttentes().filter((signal) => signal === undefined)).toHaveLength(0); // rejet immédiat, aucune attente mesurable
    });
  });

  describe("critère 8 — crash après réservation", () => {
    it("échec injecté après l'écriture (suppression du verrou) ⇒ réservation consommée malgré l'échec rapporté", async () => {
      const base = creerOperationsFichierNode();
      const operationsEnPanne = avecEchecSiPredicat(
        base,
        "supprimer",
        (args) => typeof args[0] === "string" && args[0].endsWith(".lock"),
        "EIO",
      );
      const qs = construire(dir, clock, { g: config({ minIntervalMs: 0 }) }, operationsEnPanne);

      await expect(qs.reserveDepart("g", LOIN(clock))).rejects.toBeInstanceOf(ErreurStockage);

      // Un nouveau processus (opérations saines) relit l'état : la réservation est consommée.
      const qsSain = construire(dir, clock, { g: config({ minIntervalMs: 0 }) });
      const statut = await qsSain.getStatut("g");
      expect(statut.quotaJourRestant).toBe(10000 - 1);
    });
  });

  describe("critère 9 — Retry-After > deadline", () => {
    it("rejet immédiat sans attente mesurable ni réservation ; cooldown conservé pour la suite", async () => {
      const qs = construire(dir, clock, { g: config({ minIntervalMs: 0 }) });
      const finCooldown = new Date(clock.now().getTime() + 100000);
      await qs.enregistrerCooldown429("g", finCooldown);

      const deadlineProche = new Date(clock.now().getTime() + 5000);
      await expect(qs.reserveDepart("g", deadlineProche)).rejects.toMatchObject({
        erreur: { code: "RESOLUTION_INCOMPLETE", details: { raison: "deadline" } },
      });
      expect(clock.signauxAttentes().filter((signal) => signal === undefined)).toHaveLength(0);
      expect((await qs.getStatut("g")).quotaJourRestant).toBe(10000); // aucune réservation

      // Le cooldown est conservé : un appel suivant avec une deadline couvrant le cooldown attend
      // toujours jusqu'à sa fin (deadline plus large que celle, trop courte, du premier appel).
      const p = qs.reserveDepart("g", new Date(finCooldown.getTime() + 60000));
      let resolu = false;
      p.then(() => {
        resolu = true;
      });
      await clock.avancerA(new Date(finCooldown.getTime() - 1));
      expect(resolu).toBe(false);
      await clock.avancerA(new Date(finCooldown.getTime() + 1));
      await p;
      expect(resolu).toBe(true);
    });
  });

  describe("critère 10 — cooldown 429 partagé", () => {
    it("un consommateur l'enregistre, un autre attend au moins jusqu'à sa fin ; un cooldown plus court n'écrase pas un plus long", async () => {
      const qs = construire(dir, clock, { g: config({ minIntervalMs: 0 }) });
      const finLongue = new Date(clock.now().getTime() + 5000);
      await qs.enregistrerCooldown429("g", finLongue);

      // Un cooldown plus court, enregistré après, ne raccourcit pas le cooldown partagé.
      await qs.enregistrerCooldown429("g", new Date(clock.now().getTime() + 1000));

      const p = qs.reserveDepart("g", LOIN(clock));
      let resolu = false;
      p.then(() => {
        resolu = true;
      });
      await clock.avancerA(new Date(finLongue.getTime() - 1));
      expect(resolu).toBe(false);
      await clock.avancerA(new Date(finLongue.getTime() + 1));
      await p;
      expect(resolu).toBe(true);
    });
  });

  describe("critère 11 — verrou libre pendant l'attente", () => {
    it("un autre appelant acquiert le verrou pendant qu'un premier attend son créneau", async () => {
      const qs = construire(dir, clock, { g: config({ minIntervalMs: 1000, reserve: 0 }) });

      await qs.reserveDepart("g", LOIN(clock)); // départ 1
      const p2 = qs.reserveDepart("g", LOIN(clock)); // départ 2, doit attendre ~1000 ms

      // Attend que la boucle de reserveDepart entre réellement dans son attente (verrou déjà
      // libéré à ce stade, cf. implémentation : le verrou n'est jamais détenu pendant l'attente).
      while (!clock.attenteEnCoursPour(undefined)) {
        await new Promise((resolve) => setImmediate(resolve));
      }

      // Pendant cette attente, un autre appelant obtient le même verrou sans jamais bloquer :
      // l'incrément auth mute sous le même verrou que reserveDepart.
      await qs.incrementerAuth("g");
      expect(await qs.getCompteurAuth("g")).toBe(1);

      await clock.avancerDe(1000);
      await p2;
    });
  });

  describe("critère 12 — annulation", () => {
    it("signal déjà déclenché ⇒ rejet immédiat, aucune réservation", async () => {
      const qs = construire(dir, clock, { g: config({ minIntervalMs: 0 }) });
      const controleur = new AbortController();
      controleur.abort();

      await expect(qs.reserveDepart("g", LOIN(clock), controleur.signal)).rejects.toMatchObject({
        erreur: { code: "RESOLUTION_INCOMPLETE", details: { raison: "annule" } },
      });
      expect((await qs.getStatut("g")).quotaJourRestant).toBe(10000);
    });

    it("signal déclenché pendant l'attente ⇒ rejet, aucune réservation, aucune nouvelle tentative", async () => {
      const qs = construire(dir, clock, { g: config({ minIntervalMs: 1000, reserve: 0 }) });
      await qs.reserveDepart("g", LOIN(clock)); // départ 1

      const controleur = new AbortController();
      const p2 = qs.reserveDepart("g", LOIN(clock), controleur.signal); // doit attendre

      while (!clock.attenteEnCoursPour(controleur.signal)) {
        await new Promise((resolve) => setImmediate(resolve));
      }
      controleur.abort();

      await expect(p2).rejects.toMatchObject({
        erreur: { code: "RESOLUTION_INCOMPLETE", details: { raison: "annule" } },
      });
      // Aucune nouvelle réservation : toujours un seul départ consommé (celui d'avant l'attente).
      expect((await qs.getStatut("g")).quotaJourRestant).toBe(10000 - 1);
    });
  });

  describe("critère 13 — getStatut", () => {
    it("les trois formules, quotaEstime: true, réserve atteinte ⇒ quotaUtilisable = 0", async () => {
      const qs = construire(dir, clock, { g: config({ minIntervalMs: 0, maxPerDay: 20, reserve: 5 }) });
      for (let i = 0; i < 14; i += 1) {
        await qs.reserveDepart("g", LOIN(clock));
      }
      const statut = await qs.getStatut("g");
      expect(statut).toEqual({ quotaJourRestant: 6, quotaUtilisable: 1, quotaEstime: true });

      for (let i = 0; i < 1; i += 1) {
        await qs.reserveDepart("g", LOIN(clock));
      }
      const statutLimite = await qs.getStatut("g");
      expect(statutLimite).toEqual({ quotaJourRestant: 5, quotaUtilisable: 0, quotaEstime: true });
    });

    it("la lecture n'écrit pas : contenu et mtime du fichier d'état inchangés", async () => {
      const qs = construire(dir, clock, { g: config({ minIntervalMs: 0 }) });
      await qs.reserveDepart("g", LOIN(clock));

      const chemin = join(dir, "quota", "g.json");
      const avant = await readFile(chemin, "utf8");
      const mtimeAvant = (await stat(chemin)).mtimeMs;

      await qs.getStatut("g");
      await qs.getStatut("g");

      const apres = await readFile(chemin, "utf8");
      const mtimeApres = (await stat(chemin)).mtimeMs;
      expect(apres).toBe(avant);
      expect(mtimeApres).toBe(mtimeAvant);
    });

    it("absence de fichier d'état ⇒ journée vierge, pas une erreur", async () => {
      const qs = construire(dir, clock, { g: config() });
      await expect(qs.getStatut("g")).resolves.toEqual({
        quotaJourRestant: 10000,
        quotaUtilisable: 9500,
        quotaEstime: true,
      });
    });

    it("état illisible ⇒ erreur typée, jamais de réinitialisation silencieuse", async () => {
      const qs = construire(dir, clock, { g: config() });
      await qs.reserveDepart("g", LOIN(clock));

      const chemin = join(dir, "quota", "g.json");
      await writeFile(chemin, "{ceci n'est pas du json", "utf8");

      await expect(qs.getStatut("g")).rejects.toBeInstanceOf(ErreurStockage);
    });
  });

  describe("critère 14 — compteur métier vs auth", () => {
    it("l'incrément auth ne décrémente pas le quota métier et n'apparaît pas dans getStatut", async () => {
      const qs = construire(dir, clock, { g: config({ minIntervalMs: 0 }) });
      await qs.reserveDepart("g", LOIN(clock));
      await qs.reserveDepart("g", LOIN(clock));

      const statutAvantAuth = await qs.getStatut("g");
      await qs.incrementerAuth("g");
      await qs.incrementerAuth("g");
      const statutApresAuth = await qs.getStatut("g");

      expect(statutApresAuth).toEqual(statutAvantAuth); // inchangé par les incréments auth
      expect(await qs.getCompteurAuth("g")).toBe(2);
      expect(statutApresAuth.quotaJourRestant).toBe(10000 - 2); // seuls les départs admis comptent
    });
  });
});
