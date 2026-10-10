import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  ArticleSchema,
  ClientGcSchema,
  CompteGeneralSchema,
  DocumentVenteSchema,
  EcheanceSchema,
  EcritureSchema,
  InformationDomaineSchema,
  JournalSchema,
  LigneEcritureListeSchema,
  MARQUEURS_COUVERTURE,
  MetaSchema,
  ParametresDossierSchema,
  TauxTvaCptSchema,
  TiersSchema,
  TransactionBancaireSchema,
  TypeCompteAuxiliaireSchema,
  chargerCorpus,
  determinerFormeEnveloppeReelle,
  enveloppeSchema,
  estDateCivile,
  filtrerParCouverture,
  isValidDecimalString,
  trouverParId,
  type MarqueurCouverture,
} from "../dist/index.js";
import { z } from "zod";

const REPERTOIRE_CORPUS = fileURLToPath(new URL("./corpus/ebp", import.meta.url));

const corpus = chargerCorpus(REPERTOIRE_CORPUS);

/** Meta factice v0.1 (0 appel réseau) : seules les attentes nous intéressent ici, pas la métrologie réelle. */
const META_FACTICE = {
  appels_api: 0,
  appels_auth: 0,
  duree_ms: 0,
  quota_jour_restant: null,
  quota_utilisable: null,
  quota_estime: null,
  approximatif: false,
  completude: "complete" as const,
  raison_arret: null,
  sources: [],
  avertissements: [],
  mode: "mock" as const,
  observe_a: "2026-10-06T00:00:00Z",
};

const SCHEMA_PAR_FIXTURE: Record<string, z.ZodType> = {
  "compta-tiers-liste-data": TiersSchema,
  "gescom-items-liste-elements": ArticleSchema,
  "compta-lines-entries": LigneEcritureListeSchema,
  "compta-search-entries-tableau-nu": LigneEcritureListeSchema,
  "compta-domain-information": InformationDomaineSchema,
  "compta-folder-settings": ParametresDossierSchema,
  "compta-auxiliary-account-types": TypeCompteAuxiliaireSchema,
  "compta-auxiliary-account-detail": TiersSchema,
  "compta-general-account-liste": CompteGeneralSchema,
  "compta-general-account-detail": CompteGeneralSchema,
  "compta-journals": JournalSchema,
  "compta-entry-detail": EcritureSchema,
  "compta-bank-transactions": TransactionBancaireSchema,
  "compta-vat-rate": TauxTvaCptSchema,
  "gescom-sale-documents-enum-inconnu": DocumentVenteSchema,
  "gescom-sale-documents-avoir-negatif": DocumentVenteSchema,
  "gescom-sale-commitments-fenetre-un-jour": EcheanceSchema,
  "gescom-items-pagination-invalide": ArticleSchema,
  "gescom-items-page-vide": ArticleSchema,
  "gescom-item-good-detail": ArticleSchema,
  "gescom-item-service-detail": ArticleSchema,
  "gescom-customer-detail": ClientGcSchema,
  "gescom-items-decimal-precision": ArticleSchema,
};
// Référentiel GC des taux de TVA : aucun schéma domaine dédié en lot 1 (hors périmètre T03a/T03b).
const SCHEMA_GENERIQUE = z.record(z.string(), z.unknown());

function parcourirChaines(valeur: unknown, visiteur: (chaine: string) => void): void {
  if (typeof valeur === "string") {
    visiteur(valeur);
    return;
  }
  if (Array.isArray(valeur)) {
    for (const element of valeur) {
      parcourirChaines(element, visiteur);
    }
    return;
  }
  if (typeof valeur === "object" && valeur !== null) {
    for (const cle of Object.keys(valeur)) {
      parcourirChaines((valeur as Record<string, unknown>)[cle], visiteur);
    }
  }
}

// Toute chaîne numérique, exponentielle incluse : `isValidDecimalString` (Big.js) accepte
// « 1.2e3 », donc la canonicité doit être testée sur un filtre plus large que la forme attendue.
const FORME_NUMERIQUE = /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/;
const FORME_DATE = /^\d{4}-\d{2}-\d{2}$/;

const PATRONS_SECRETS: RegExp[] = [
  /bearer\s+[a-z0-9\-_.]+/i,
  /subscription[-_]?key/i,
  /client[_-]?secret/i,
  /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/, // IBAN plausible
  /[\w.+-]+@[\w-]+\.[a-z]{2,}/i, // email
];

describe("corpus EBP (tests/corpus/ebp) — provenance et comportement", () => {
  it("point 1 — chaque fichier valide le schéma de manifeste, les ids sont uniques", () => {
    expect(corpus.length).toBeGreaterThan(0);
    const ids = corpus.map((fixture) => fixture.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  describe("point 1 — le chargeur échoue bruyamment et nomme le fichier fautif", () => {
    let repertoireTemporaire = "";

    afterEach(() => {
      if (repertoireTemporaire) {
        rmSync(repertoireTemporaire, { recursive: true, force: true });
      }
    });

    it("rejette un manifeste invalide sans retomber sur une liste vide", () => {
      repertoireTemporaire = mkdtempSync(join(tmpdir(), "ebp-corpus-invalide-"));
      const cheminInvalide = join(repertoireTemporaire, "invalide.json");
      writeFileSync(cheminInvalide, JSON.stringify({ id: "pas-un-manifeste-complet" }), "utf8");

      expect(() => chargerCorpus(repertoireTemporaire)).toThrowError(/invalide\.json/);
    });

    it("rejette deux fixtures portant le même id", () => {
      repertoireTemporaire = mkdtempSync(join(tmpdir(), "ebp-corpus-duplique-"));
      const fixture = corpus[0];
      expect(fixture).toBeDefined();
      writeFileSync(join(repertoireTemporaire, "a.json"), JSON.stringify(fixture), "utf8");
      writeFileSync(join(repertoireTemporaire, "b.json"), JSON.stringify(fixture), "utf8");

      expect(() => chargerCorpus(repertoireTemporaire)).toThrowError(/dupliqué/);
    });
  });

  it("point 2 — la forme déclarée correspond à la forme réelle du corps (discrimination, pas confiance)", () => {
    for (const fixture of corpus) {
      const formeReelle = determinerFormeEnveloppeReelle(fixture.reponse_ebp.corps);
      expect(formeReelle, `fixture ${fixture.id}`).toBe(fixture.forme_enveloppe);
    }
  });

  it("point 3 — chaînes décimales des attentes valides/canoniques, dates civiles valides", () => {
    // Garde-fou : le filtre doit rester capable d'attraper une notation exponentielle, sinon
    // l'assertion de canonicité ci-dessous ne serait jamais atteinte.
    expect(FORME_NUMERIQUE.test("1.2e3")).toBe(true);
    expect(isValidDecimalString("1.2e3")).toBe(true);

    for (const fixture of corpus) {
      parcourirChaines(fixture.attentes, (chaine) => {
        if (FORME_NUMERIQUE.test(chaine)) {
          expect(isValidDecimalString(chaine), `fixture ${fixture.id} : "${chaine}"`).toBe(true);
          expect(chaine, `fixture ${fixture.id} : notation exponentielle interdite`).not.toMatch(/e/i);
        }
        if (FORME_DATE.test(chaine)) {
          expect(estDateCivile(chaine), `fixture ${fixture.id} : date "${chaine}" invalide`).toBe(true);
        }
      });
    }
  });

  it("point 4 — source officielle EBP, date de consultation valide, aucune fixture `observe`", () => {
    for (const fixture of corpus) {
      expect(fixture.source.url.startsWith("https://developpeurs-storage.ebp.com")).toBe(true);
      expect(estDateCivile(fixture.source.consulte_le)).toBe(true);
      expect(fixture.statut).not.toBe("observe");
    }
  });

  it("point 5 — aucun secret ni PII plausible dans le corpus", () => {
    for (const fixture of corpus) {
      const contenu = JSON.stringify(fixture);
      for (const patron of PATRONS_SECRETS) {
        expect(contenu, `fixture ${fixture.id} correspond à ${patron}`).not.toMatch(patron);
      }
    }
  });

  it("point 6 — l'ensemble fermé des 13 marqueurs de couverture est intégralement couvert", () => {
    for (const marqueur of MARQUEURS_COUVERTURE) {
      const fixturesCouvrantes = filtrerParCouverture(corpus, marqueur as MarqueurCouverture);
      expect(fixturesCouvrantes.length, `marqueur "${marqueur}" non couvert`).toBeGreaterThan(0);
    }
  });

  it("point 7 — les attentes respectent les schémas d'enveloppe/domaine du lot 1 (pagination null pour fiche/agrégat)", () => {
    for (const fixture of corpus) {
      const schemaResultat = SCHEMA_PAR_FIXTURE[fixture.id] ?? SCHEMA_GENERIQUE;
      const enveloppe = {
        dossier: null,
        resultats: fixture.attentes.resultats,
        pagination: fixture.attentes.pagination,
        meta: META_FACTICE,
      };
      expect(() => enveloppeSchema(schemaResultat).parse(enveloppe), `fixture ${fixture.id}`).not.toThrow();
      expect(() => MetaSchema.parse(enveloppe.meta)).not.toThrow();

      const estFicheOuAgregat =
        fixture.attentes.erreur !== null ||
        fixture.forme_enveloppe === "tableau_nu" ||
        fixture.forme_enveloppe === "fiche";
      if (estFicheOuAgregat) {
        expect(fixture.attentes.pagination, `fixture ${fixture.id}`).toBeNull();
      }
    }
  });

  it("trouverParId retrouve une fixture connue et renvoie undefined sinon", () => {
    const connue = corpus[0];
    expect(connue).toBeDefined();
    expect(trouverParId(corpus, connue!.id)).toBe(connue);
    expect(trouverParId(corpus, "id-inexistant")).toBeUndefined();
  });
});
