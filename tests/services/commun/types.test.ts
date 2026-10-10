import { describe, expect, it } from "vitest";
import { exigerFamilleOutil } from "../../../dist/index.js";
import type { ContexteService, Identifiant } from "../../../dist/index.js";
import { contexteTest } from "../../pagination/fixtures.js";

const ALIAS_TEST = "alias-test" as Identifiant;

function ctxDe(familleDossier: "hubbix-compta" | "hubbix-gescom", familleHttp: "hubbix-compta" | "hubbix-gescom" = familleDossier): ContexteService {
  return {
    execution: contexteTest() as unknown as ContexteService["execution"],
    http: {
      environnement: "prod",
      famille: familleHttp,
      dossierId: "D1",
      subscriptionKey: null,
      groupeQuota: "groupe-test",
    },
    dossier: { alias: ALIAS_TEST, famille: familleDossier, id: "D1", nom: null },
  };
}

describe("types.ts — exigerFamilleOutil (D-T11-1) : refuse avant tout réseau", () => {
  it("outil CPT (rechercher_tiers) sur dossier GC ⇒ UNSUPPORTED_CAPABILITY", () => {
    expect(() => exigerFamilleOutil("rechercher_tiers", ctxDe("hubbix-gescom"))).toThrowError();
    try {
      exigerFamilleOutil("rechercher_tiers", ctxDe("hubbix-gescom"));
    } catch (erreur) {
      expect(erreur).toMatchObject({ erreur: { code: "UNSUPPORTED_CAPABILITY" } });
    }
  });

  it("dossier.famille ≠ http.famille ⇒ UNSUPPORTED_CAPABILITY, même si l'outil accepte les deux familles", () => {
    expect(() => exigerFamilleOutil("fiche_tiers", ctxDe("hubbix-compta", "hubbix-gescom"))).toThrowError();
  });

  it("outil et familles cohérentes (rechercher_tiers sur hubbix-compta) ⇒ accepté", () => {
    expect(() => exigerFamilleOutil("rechercher_tiers", ctxDe("hubbix-compta"))).not.toThrow();
  });

  it("outil GC (rechercher_articles) sur dossier CPT ⇒ UNSUPPORTED_CAPABILITY", () => {
    expect(() => exigerFamilleOutil("rechercher_articles", ctxDe("hubbix-compta"))).toThrowError();
  });
});
