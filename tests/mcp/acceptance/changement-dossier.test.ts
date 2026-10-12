// Scénario transverse 7 (09, fiche T14-3) : un appel bloqué en cours garde le dossier capturé à
// son entrée (07 §2, `capturerContexteDossier`/D-T12-12 : instantané gelé), même si
// `ebp_choisir_dossier` change le dossier actif de la session avant que l'appel en vol ne
// termine. L'appel suivant, lui, voit le nouveau dossier.
import { afterEach, describe, expect, it } from "vitest";
import type { HttpResponseSpec } from "../../../dist/index.js";
import {
  creerTransportPersonnalise,
  demarrerClientPersonnalise,
  DOSSIER_GC,
  reponseJson,
  TENANT_ID_DEMO_CPT,
  type ContexteClientPersonnalise,
} from "./fixtures.js";

let contexte: ContexteClientPersonnalise | undefined;

afterEach(async () => {
  if (contexte !== undefined) {
    await contexte.fermer();
    contexte = undefined;
  }
});

interface Enveloppe {
  readonly dossier: string | null;
}

describe("scénario transverse 7 — changement de dossier en vol : l'appel en cours garde le dossier capturé à l'entrée (07 §2)", () => {
  it(
    "rechercher_tiers démarré sur le dossier par défaut (demo-cpt) reste sur demo-cpt (en-tête `tenantid`, " +
      "`enveloppe.dossier`) même si `ebp_choisir_dossier` bascule la session sur demo-gc pendant que la requête " +
      "HTTP est en attente ; l'appel suivant (`ebp_statut`) voit lui le nouveau dossier actif",
    async () => {
      let signalerRequeteRecue!: () => void;
      const requeteRecue = new Promise<void>((resolve) => {
        signalerRequeteRecue = resolve;
      });
      let resoudreReponse!: (reponse: HttpResponseSpec) => void;
      const reponseDifferee = new Promise<HttpResponseSpec>((resolve) => {
        resoudreReponse = resolve;
      });

      const transport = creerTransportPersonnalise((_spec, appel) => {
        if (appel === 1) {
          signalerRequeteRecue();
          return reponseDifferee;
        }
        return reponseJson(200, { data: [], totalRecords: 0 });
      });

      contexte = await demarrerClientPersonnalise({ transport });

      // Démarre un scan sans `dossier` explicite : résolu via la session (défaut `demo-cpt` du
      // profil de démo), requête partie, pas encore résolue.
      const appelEnVol = contexte.client.callTool({ name: "rechercher_tiers", arguments: {} });
      await requeteRecue;
      expect(transport.appels).toHaveLength(1);
      expect(transport.appels[0]!.headers?.["tenantid"]).toBe(TENANT_ID_DEMO_CPT);
      expect(transport.appels[0]!.headers?.["DomainId"]).toBeUndefined();

      // Changement de dossier actif de la session pendant que l'appel précédent attend toujours
      // sa réponse HTTP (D-T12-12 : mutation locale, 0 réseau).
      const choix = await contexte.client.callTool({
        name: "ebp_choisir_dossier",
        arguments: { dossier: DOSSIER_GC },
      });
      expect(choix.isError).toBeFalsy();
      expect(
        (choix.structuredContent as { resultats: { dossier_actif: string }[] }).resultats[0]!.dossier_actif,
      ).toBe(DOSSIER_GC);

      // Débloque la réponse HTTP de l'appel en vol, après le changement de dossier.
      resoudreReponse(reponseJson(200, { data: [], totalRecords: 0 }));

      const resultatEnVol = await appelEnVol;
      expect(resultatEnVol.isError).toBeFalsy();
      const enveloppeEnVol = resultatEnVol.structuredContent as unknown as Enveloppe;
      // Le dossier porté par l'enveloppe est celui capturé à l'entrée (demo-cpt), jamais demo-gc.
      expect(enveloppeEnVol.dossier).toBe(TENANT_ID_DEMO_CPT);
      // Aucune requête supplémentaire n'a été émise pour ce premier appel (page vide = fin de source).
      expect(transport.appels).toHaveLength(1);

      // L'appel suivant, sans `dossier` explicite, voit bien le nouveau dossier actif de session.
      const statut = await contexte.client.callTool({ name: "ebp_statut", arguments: {} });
      expect(statut.isError).toBeFalsy();
      expect(
        (statut.structuredContent as { resultats: { dossier_actif: string | null }[] }).resultats[0]!.dossier_actif,
      ).toBe(DOSSIER_GC);
    },
  );
});
