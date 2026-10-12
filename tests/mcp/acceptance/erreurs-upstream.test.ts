// Scénario transverse 5 (09) : un 403 EBP et un JSON de forme incompatible donnent chacun une
// erreur stable et nettoyée (07 §4/§7), jamais une approximation, et jamais le corps EBP brut.
import { afterEach, describe, expect, it } from "vitest";
import { creerTransportPersonnalise, demarrerClientPersonnalise, DOSSIER_CPT, reponseJson, type ContexteClientPersonnalise } from "./fixtures.js";

let contexte: ContexteClientPersonnalise | undefined;

afterEach(async () => {
  if (contexte !== undefined) {
    await contexte.fermer();
    contexte = undefined;
  }
});

describe("scénario transverse 5a — 403 EBP : PERMISSION_DENIED, une seule tentative, jamais le corps EBP brut", () => {
  it("isError true, code PERMISSION_DENIED, exactement 1 requête transport (aucun retry sur 403), aucun fragment du corps EBP brut dans la réponse MCP", async () => {
    // Corps EBP volontairement réaliste (403, message interne) pour prouver qu'aucun de ses
    // fragments ne traverse jusqu'à la réponse MCP.
    const CORPS_EBP_BRUT = "DroitsInsuffisantsInternes-xyz-789-ne-doit-jamais-fuiter";
    const transport = creerTransportPersonnalise(() =>
      reponseJson(403, { status: 403, errorCode: "Forbidden", message: CORPS_EBP_BRUT }),
    );
    contexte = await demarrerClientPersonnalise({ transport });

    const reponse = await contexte.client.callTool({
      name: "rechercher_tiers",
      arguments: { dossier: DOSSIER_CPT },
    });

    expect(reponse.isError).toBe(true);
    expect(reponse.structuredContent).toBeUndefined();
    const texte = JSON.stringify(reponse.content);
    expect(texte).toContain("PERMISSION_DENIED");
    expect(texte).not.toContain(CORPS_EBP_BRUT);
    expect(texte).not.toContain("Forbidden");
    expect(transport.appels).toHaveLength(1);
  });
});

describe("scénario transverse 5b — JSON de forme incompatible : UPSTREAM_SCHEMA_CHANGED, aucune approximation ni champ inventé", () => {
  it("un élément de liste sans les champs documentés (`name`/`number`/… absents) donne UPSTREAM_SCHEMA_CHANGED, sans fragment du corps EBP brut dans la réponse MCP", async () => {
    const VALEUR_INVENTEE_INTERDITE = "fragment-ebp-ne-doit-jamais-fuiter-42";
    const transport = creerTransportPersonnalise(() =>
      // Enveloppe reconnue ({data:[...]}) mais élément de forme incompatible avec
      // `AuxiliaryAccountEbpSchema` (champs documentés `name`/`number`/`vatNumber`/`siret`/
      // `isActive`/`types` absents) : `safeParse` échoue, aucune valeur inventée en repli.
      reponseJson(200, { data: [{ uuid: VALEUR_INVENTEE_INTERDITE }], totalRecords: 1 }),
    );
    contexte = await demarrerClientPersonnalise({ transport });

    const reponse = await contexte.client.callTool({
      name: "rechercher_tiers",
      arguments: { dossier: DOSSIER_CPT },
    });

    expect(reponse.isError).toBe(true);
    expect(reponse.structuredContent).toBeUndefined();
    const texte = JSON.stringify(reponse.content);
    expect(texte).toContain("UPSTREAM_SCHEMA_CHANGED");
    expect(texte).not.toContain(VALEUR_INVENTEE_INTERDITE);
    expect(transport.appels).toHaveLength(1);
  });
});
