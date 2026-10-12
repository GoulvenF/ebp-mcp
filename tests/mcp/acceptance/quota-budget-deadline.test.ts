// Scénarios transverses de recette (09) : réserve de quota déjà atteinte, et budget/deadline déjà
// épuisés avant le premier résultat — dans les deux cas un partiel explicite (07 §5), jamais un
// succès exhaustif vide.
import { afterEach, describe, expect, it } from "vitest";
import {
  cheminEtatQuota,
  creerOperationsFichierNode,
  creerStoreJson,
  dateCivileDansFuseau,
  rechercherTiers,
  TYPE_QUOTA,
  validerGroupe,
} from "../../../dist/index.js";
import type { EtatQuotaPersistant, ExecutionContext } from "../../../dist/index.js";
import { creerHorlogeControlee } from "../../auth/fixtures.js";
import {
  creerTransportInterdit,
  demarrerClientPersonnalise,
  DOSSIER_CPT,
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
