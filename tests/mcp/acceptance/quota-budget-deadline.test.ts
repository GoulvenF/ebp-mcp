// Scénarios transverses de recette (09) : réserve de quota déjà atteinte, et budget/deadline déjà
// épuisés avant le premier résultat — dans les deux cas un partiel explicite (07 §5), jamais un
// succès exhaustif vide.
import { afterEach, describe, expect, it } from "vitest";
import {
  cheminEtatQuota,
  creerOperationsFichierNode,
  creerStoreJson,
  dateCivileDansFuseau,
  DEADLINE_OUTIL_MS,
  rechercherTiers,
  TYPE_QUOTA,
  validerGroupe,
} from "../../../dist/index.js";
import type { EtatQuotaPersistant, ExecutionContext } from "../../../dist/index.js";
import { creerHorlogeControlee } from "../../auth/fixtures.js";
import {
  creerTransportInterdit,
  creerTransportPersonnalise,
  demarrerClientPersonnalise,
  DOSSIER_CPT,
  reponseJson,
  type ContexteClientPersonnalise,
} from "./fixtures.js";
import { ctxDe, depsDe } from "../../services/compta/fixtures.js";

let contexte: ContexteClientPersonnalise | undefined;

afterEach(async () => {
  if (contexte !== undefined) {
    await contexte.fermer();
    contexte = undefined;
  }
});

interface Meta {
  readonly completude: string;
  readonly raison_arret: string | null;
  readonly approximatif: boolean;
}

interface Enveloppe {
  readonly resultats: unknown[];
  readonly meta: Meta;
}

describe("scénario transverse 3 — réserve de quota déjà atteinte avant le premier résultat (07 §4/§5)", () => {
  it(
    "quota pré-rempli jusqu'à la réserve du groupe `demo` (consommé = maxPerDay - reserve) avant tout " +
      "appel : `rechercher_tiers` rend un partiel explicite (raison_arret: \"quota\"), pas un succès " +
      "vide exhaustif, et zéro tentative n'atteint le transport métier",
    async () => {
      const transport = creerTransportInterdit();
      contexte = await demarrerClientPersonnalise({ transport });

      // Écrit directement l'état de quota persistant du groupe `demo` (PROFIL_DEMO, 07 §2 :
      // maxPerDay 10000, reserve 500) sous la racine de la pile, via le même `StoreJson`/chemin que
      // `creerQuotaStoreFichier` (T05) — pas une API de quota factice, l'implémentation réelle lit ce
      // fichier au prochain `reserveDepart`.
      const operations = creerOperationsFichierNode();
      const store = creerStoreJson({ operations });
      const clock = contexte.pile.clock;
      const jour = dateCivileDansFuseau(clock.now(), "Europe/Paris");
      const etatEpuise: EtatQuotaPersistant = {
        jour,
        consomme: 10_000 - 500,
        consommeAuth: 0,
        dernierDepart: null,
        finCooldown429: null,
      };
      await store.ecrire(cheminEtatQuota(contexte.racine, validerGroupe("demo")), TYPE_QUOTA, etatEpuise);

      const reponse = await contexte.client.callTool({
        name: "rechercher_tiers",
        arguments: { dossier: DOSSIER_CPT },
      });

      expect(reponse.isError).toBeFalsy();
      const enveloppe = reponse.structuredContent as unknown as Enveloppe;
      expect(enveloppe.meta.raison_arret).toBe("quota");
      expect(enveloppe.meta.completude).toBe("partielle");
      expect(enveloppe.meta.approximatif).toBe(true);
      expect(enveloppe.resultats).toEqual([]);
      expect(transport.appels).toHaveLength(0);
    },
  );
});

describe("scénario transverse 4 — budget ou deadline déjà épuisés avant le premier résultat (07 §4/§5)", () => {
  it(
    "deadline de l'outil dépassée pendant la lecture de la première page (0 match) : la page " +
      "suivante est empêchée par `budgetOuDeadlineEpuises` avant tout appel transport supplémentaire " +
      "— partiel explicite (raison_arret: \"deadline\"), jamais un succès vide exhaustif. Le cas " +
      "symétrique du budget (0 appel avant tout résultat) est déjà prouvé au niveau MCP par le " +
      "scénario transverse 1 (`scan-transverse.test.ts`, 30 départs HTTP, raison_arret: \"budget\")",
    async () => {
      // Transport contrôlé : la toute première page (skip 0, 100 éléments, aucun match pour le
      // filtre) avance l'horloge réelle de la pile (`pile.clock`, l'horloge qui sert à calculer
      // `deadline` dans `src/mcp/execution/pipeline.ts`) au-delà de `DEADLINE_OUTIL_MS` avant de
      // répondre. `hasMore` reste vrai (`totalRecords` très supérieur à skip+take), donc `scanner`
      // tente de lire une seconde page ; `lirePageGardee` la refuse avant tout départ réseau.
      const transport = creerTransportPersonnalise((spec, appel) => {
        const url = new URL(spec.url);
        const skip = Number.parseInt(url.searchParams.get("skip") ?? "0", 10);
        const take = Number.parseInt(url.searchParams.get("take") ?? "100", 10);
        if (appel === 1) {
          contexte!.pile.clock.avancer(DEADLINE_OUTIL_MS + 1);
        }
        const data = Array.from({ length: take }, (_, i) => ({
          uuid: `tiers-deadline-${skip + i}`,
          name: `Tiers synthétique ${skip + i}`,
          number: `9${String(skip + i).padStart(6, "0")}`,
          vatNumber: null,
          siret: null,
          isActive: true,
          types: null,
        }));
        return reponseJson(200, { data, totalRecords: 100_000_000 });
      });

      contexte = await demarrerClientPersonnalise({ transport });
      const reponse = await contexte.client.callTool({
        name: "rechercher_tiers",
        arguments: { dossier: DOSSIER_CPT, texte: "ZZZ-NE-CORRESPOND-JAMAIS" },
      });

      expect(reponse.isError).toBeFalsy();
      const enveloppe = reponse.structuredContent as unknown as Enveloppe;
      expect(enveloppe.meta.completude).toBe("partielle");
      expect(enveloppe.meta.raison_arret).toBe("deadline");
      expect(enveloppe.meta.approximatif).toBe(true);
      expect(enveloppe.resultats).toEqual([]);
      // Exactement 1 départ HTTP (la première page, sans match) : la deadline dépassée empêche la
      // seconde page avant tout appel supplémentaire — nombre écrit à la main.
      expect(transport.appels).toHaveLength(1);
    },
  );
});

describe("scénario transverse 4 (complément service) — budget ou deadline déjà épuisés dès l'entrée (07 §4/§5)", () => {
  it(
    "ExecutionContext.budgetRestant === 0 dès l'entrée du service : partiel explicite " +
      "(raison_arret: \"budget\"), 0 appel transport, jamais un succès vide exhaustif",
    async () => {
      const deps = depsDe([]);
      const execution: ExecutionContext = {
        profil: "profil-test",
        environnement: "prod",
        identiteGeneration: 1,
        dossier: "dossier-cpt-test",
        budgetRestant: 0,
        deadline: new Date(deps.clock.now().getTime() + 60_000),
        signal: new AbortController().signal,
      };
      const resultat = await rechercherTiers(deps, ctxDe({ execution }), {});
      expect(resultat.raison_arret).toBe("budget");
      expect(resultat.completude).toBe("partielle");
      expect(resultat.approximatif).toBe(true);
      expect(resultat.resultats).toEqual([]);
      expect(deps.transport.appels).toHaveLength(0);
    },
  );

  it(
    "deadline déjà dépassée dès l'entrée du service (deadline < maintenant) : partiel explicite " +
      "(raison_arret: \"deadline\"), 0 appel transport, jamais un succès vide exhaustif",
    async () => {
      const deps = depsDe([]);
      const execution: ExecutionContext = {
        profil: "profil-test",
        environnement: "prod",
        identiteGeneration: 1,
        dossier: "dossier-cpt-test",
        budgetRestant: 30,
        deadline: new Date(deps.clock.now().getTime() - 1),
        signal: new AbortController().signal,
      };
      const resultat = await rechercherTiers(deps, ctxDe({ execution }), {});
      expect(resultat.raison_arret).toBe("deadline");
      expect(resultat.completude).toBe("partielle");
      expect(resultat.approximatif).toBe(true);
      expect(resultat.resultats).toEqual([]);
      expect(deps.transport.appels).toHaveLength(0);
    },
  );
});
