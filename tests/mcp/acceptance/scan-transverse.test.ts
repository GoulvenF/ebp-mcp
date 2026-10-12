// Scénarios transverses de recette (09, tableau « Scénarios transverses obligatoires ») portés au
// niveau `tools/call` réel : (1) la 31e requête HTTP est empêchée par le budget fixe de l'outil
// (07 §4, `BUDGET_TENTATIVES_OUTIL = 30`) ; (2) une page EBP de 100 éléments peu filtrée continue
// le parcours, une limite de 50 coupée en milieu de page reprend sans perte ni doublon au second
// `tools/call`, et `pagination.total` ne devient exact qu'en fin de parcours (07 §5).
import { afterEach, describe, expect, it } from "vitest";
import {
  creerTransportPersonnalise,
  demarrerClientPersonnalise,
  DOSSIER_CPT,
  reponseJson,
  type ContexteClientPersonnalise,
} from "./fixtures.js";

let contexte: ContexteClientPersonnalise | undefined;

afterEach(async () => {
  if (contexte !== undefined) {
    await contexte.fermer();
    contexte = undefined;
  }
});

interface Meta {
  readonly appels_api: number;
  readonly appels_auth: number;
  readonly completude: string;
  readonly raison_arret: string | null;
  readonly approximatif: boolean;
}

interface Enveloppe {
  readonly resultats: { readonly compte: string }[];
  readonly pagination: { readonly total: number | null; readonly total_source: number | null; readonly hasMore: boolean; readonly curseur: string | null };
  readonly meta: Meta;
}

describe("scénario transverse 1 — la 31e requête HTTP est empêchée (07 §4)", () => {
  it(
    "rechercher_tiers dont aucune page ne correspond au filtre s'arrête à exactement 30 départs HTTP " +
      "(appels_api + appels_auth), jamais 31, avec un résultat partiel explicite (completude !== " +
      "\"complete\", raison_arret: \"budget\"), jamais un succès exhaustif",
    async () => {
      // Transport qui répond toujours avec une page pleine (100 éléments uniques, jamais de match
      // pour le filtre `texte`) et `suivant` non vide via `totalRecords` très supérieur à skip+take :
      // force `scanner` à poursuivre indéfiniment jusqu'à épuisement du budget fixe de l'outil.
      const transport = creerTransportPersonnalise((spec) => {
        const url = new URL(spec.url);
        const skip = Number.parseInt(url.searchParams.get("skip") ?? "0", 10);
        const take = Number.parseInt(url.searchParams.get("take") ?? "100", 10);
        const data = Array.from({ length: take }, (_, i) => ({
          uuid: `tiers-sans-fin-${skip + i}`,
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
      expect(enveloppe.meta.completude).not.toBe("complete");
      expect(enveloppe.meta.completude).toBe("partielle");
      expect(enveloppe.meta.raison_arret).toBe("budget");
      expect(enveloppe.meta.approximatif).toBe(true);
      expect(enveloppe.resultats).toEqual([]);
      expect(enveloppe.meta.appels_api + enveloppe.meta.appels_auth).toBe(30);
      expect(transport.appels).toHaveLength(30);
    },
  );
});

describe("scénario transverse 2 — page EBP peu filtrée, limite coupée en milieu de page, reprise sans perte (07 §5)", () => {
  it(
    "200 tiers synthétiques sur deux pages de 100 : la première page (0 match) ne stoppe pas le " +
      "parcours, la seconde (60 matches) coupe à la limite par défaut (50) en son milieu, le curseur " +
      "restitue exactement les 10 matches restants sans relire de page tant qu'ils sont tamponnés, et " +
      "`pagination.total` ne devient exact (60) qu'au second appel, après que la page suivante vide a " +
      "signalé la fin du parcours",
    async () => {
      // Jeu construit par CE test (pas une fixture existante élargie) : page 1 (skip 0..99) ne
      // correspond jamais au filtre ; page 2 (skip 100..199) porte 60 matches (`RECHERCHE-CIBLE-*`,
      // index 100..159) suivis de 40 non-matches (index 160..199, `AUTRE-*`). Au-delà de 200, page
      // vide (fin de source signalée par `renvoyes: 0`, jamais par une position répétée).
      const transport = creerTransportPersonnalise((spec) => {
        const url = new URL(spec.url);
        const skip = Number.parseInt(url.searchParams.get("skip") ?? "0", 10);
        const take = Number.parseInt(url.searchParams.get("take") ?? "100", 10);
        const data = [];
        for (let i = skip; i < Math.min(skip + take, 200); i += 1) {
          const correspond = i >= 100 && i < 160;
          data.push({
            // UUID valide (`UuidSchema`) : les 60 matches de ce test traversent jusqu'à
            // `resultats[]`, contrairement au scénario 1 où aucun résultat n'est jamais retenu.
            uuid: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
            name: correspond ? `RECHERCHE-CIBLE-${i - 100}` : `AUTRE-${i}`,
            number: `9${String(i).padStart(6, "0")}`,
            vatNumber: null,
            siret: null,
            isActive: true,
            types: null,
          });
        }
        return reponseJson(200, { data, totalRecords: 200 });
      });

      contexte = await demarrerClientPersonnalise({ transport });
      const args = { dossier: DOSSIER_CPT, texte: "RECHERCHE-CIBLE" };

      const premier = await contexte.client.callTool({ name: "rechercher_tiers", arguments: args });
      expect(premier.isError).toBeFalsy();
      const enveloppe1 = premier.structuredContent as unknown as Enveloppe;
      // Comptes attendus écrits à la main depuis le jeu ci-dessus : index 100..149 ⇒ number
      // "9" + "0000100".."0000149".
      const comptesAttendusPage1 = Array.from({ length: 50 }, (_, k) => `9${String(100 + k).padStart(6, "0")}`);
      expect(enveloppe1.resultats.map((r) => r.compte)).toEqual(comptesAttendusPage1);
      expect(enveloppe1.meta.completude).toBe("page");
      expect(enveloppe1.meta.raison_arret).toBe("limite");
      expect(enveloppe1.pagination.hasMore).toBe(true);
      expect(enveloppe1.pagination.curseur).not.toBeNull();
      expect(enveloppe1.pagination.total).toBeNull();
      expect(enveloppe1.pagination.total_source).toBe(200);
      // Exactement 2 pages lues (skip 0 et skip 100) : la page vide sans match ne stoppe pas le parcours.
      expect(transport.appels).toHaveLength(2);

      const second = await contexte.client.callTool({
        name: "rechercher_tiers",
        arguments: { ...args, curseur: enveloppe1.pagination.curseur! },
      });
      expect(second.isError).toBeFalsy();
      const enveloppe2 = second.structuredContent as unknown as Enveloppe;
      const comptesAttendusPage2 = Array.from({ length: 10 }, (_, k) => `9${String(150 + k).padStart(6, "0")}`);
      expect(enveloppe2.resultats.map((r) => r.compte)).toEqual(comptesAttendusPage2);
      expect(enveloppe2.meta.completude).toBe("complete");
      expect(enveloppe2.meta.raison_arret).toBeNull();
      expect(enveloppe2.pagination.hasMore).toBe(false);
      // Total filtré exact seulement maintenant : 50 (premier appel) + 10 (second) = 60.
      expect(enveloppe2.pagination.total).toBe(60);
      expect(enveloppe2.pagination.total_source).toBe(200);

      // Concaténation des deux appels : exactement les 60 matches attendus, sans perte ni doublon.
      const concatenation = [...enveloppe1.resultats, ...enveloppe2.resultats].map((r) => r.compte);
      const attenduComplet = Array.from({ length: 60 }, (_, k) => `9${String(100 + k).padStart(6, "0")}`);
      expect(concatenation).toEqual(attenduComplet);
      expect(new Set(concatenation).size).toBe(60);

      // Une seule page supplémentaire lue au second appel (skip 200, vide) : les 10 matches restants
      // de la page 2 étaient déjà tamponnés en mémoire de session, jamais relus.
      expect(transport.appels).toHaveLength(3);
    },
  );
});
