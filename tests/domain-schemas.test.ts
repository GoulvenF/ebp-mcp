import { describe, expect, it } from "vitest";
import {
  ArticleSchema,
  DocumentVenteSchema,
  EcheanceSchema,
  EcritureSchema,
  enveloppeSchema,
  ErreurMetierSchema,
  ExerciceSchema,
  LigneBalanceSchema,
  LigneEcritureSchema,
  MetaSchema,
  PaginationSchema,
  ReglementSchema,
  TiersSchema,
  TransactionBancaireSchema,
} from "../dist/domain/index.js";

describe("schémas Zod : champ inconnu = null, jamais inventé", () => {
  it("accepte un Tiers dont les champs non garantis par 02 valent null et les ressort en null", () => {
    const tiers = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      compte: "0004100",
      nom: "Client Démo",
      types: null,
      numero_tva: null,
      siret: null,
      actif: null,
      email: null,
      telephone: null,
    };
    const resultat = TiersSchema.parse(tiers);
    expect(resultat.types).toBeNull();
    expect(resultat.numero_tva).toBeNull();
    expect(resultat.siret).toBeNull();
    expect(resultat.actif).toBeNull();
  });

  it("rejette un Tiers dont le champ obligatoire `nom` est absent", () => {
    const tiersIncomplet = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      compte: "0004100",
      types: null,
      numero_tva: null,
      siret: null,
      actif: null,
      email: null,
      telephone: null,
    };
    expect(() => TiersSchema.parse(tiersIncomplet)).toThrow();
  });

  it("rejette un compte vide (estCompte) même si le champ est présent", () => {
    expect(() =>
      TiersSchema.parse({
        id: "550e8400-e29b-41d4-a716-446655440000",
        compte: "",
        nom: "Client Démo",
        types: null,
        numero_tva: null,
        siret: null,
        actif: null,
        email: null,
        telephone: null,
      }),
    ).toThrow();
  });
});

describe("schémas compta (point 12)", () => {
  it("accepte une écriture dont la ligne a un `id` distinct de `ecriture_id` (A26)", () => {
    const ligne = {
      id: "ligne-1",
      ecriture_id: "ecriture-1",
      compte_general: "411000",
      compte_tiers: null,
      libelle: "Vente",
      debit: "100.00",
      credit: null,
      piece: null,
      echeance: null,
      lettrage: null,
    };
    const ecriture = {
      id: "ecriture-1",
      journal: "VE",
      date: "2026-03-01",
      mode: "valide",
      lignes: [ligne],
    };
    const resultat = EcritureSchema.parse(ecriture);
    expect(resultat.lignes[0]?.id).toBe("ligne-1");
    expect(resultat.lignes[0]?.ecriture_id).toBe("ecriture-1");
    expect(resultat.lignes[0]?.id).not.toBe(resultat.lignes[0]?.ecriture_id);
  });

  it("rejette une ligne d'écriture dont le champ obligatoire `ecriture_id` est absent", () => {
    expect(() =>
      LigneEcritureSchema.parse({
        id: "ligne-1",
        compte_general: null,
        compte_tiers: null,
        libelle: null,
        debit: null,
        credit: null,
        piece: null,
        echeance: null,
        lettrage: null,
      }),
    ).toThrow();
  });

  it("conserve `statut_source` sans conversion de code et accepte `statut: null` (transaction bancaire)", () => {
    const transaction = {
      id: "tx-1",
      libelle: "Virement",
      compte_bancaire: "512000",
      date_operation: "2026-03-01",
      date_valeur: null,
      debit: null,
      credit: "250.00",
      reference: null,
      statut: null,
      statut_source: "1",
    };
    const resultat = TransactionBancaireSchema.parse(transaction);
    expect(resultat.statut).toBeNull();
    expect(resultat.statut_source).toBe("1");
  });

  it("accepte une ligne de balance avec `devise` null (pas de preuve de devise)", () => {
    const ligne = {
      compte: "411000",
      debit: "100.00",
      credit: "0",
      solde: "100.00",
      solde_debiteur: "100.00",
      solde_crediteur: "0",
      devise: null,
    };
    expect(() => LigneBalanceSchema.parse(ligne)).not.toThrow();
  });
});

describe("schémas gescom (point 12)", () => {
  it("accepte un Article dont la devise est null et la conserve", () => {
    const article = {
      id: "art-1",
      code: "ART001",
      libelle: "Prestation",
      type: "service",
      prix_ht: "99.90",
      prix_ttc: "119.88",
      taux_tva: "20",
      devise: null,
      actif: true,
    };
    const resultat = ArticleSchema.parse(article);
    expect(resultat.devise).toBeNull();
  });

  it("accepte un document de vente dont `devise` et les champs non garantis par 02 valent null", () => {
    const document = {
      id: "doc-1",
      type: "SaleInvoice",
      statut: "valide",
      tiers_nom: "Client Démo",
      tiers_id: null,
      date: "2026-03-01",
      numero: "F2026-001",
      montant_ht: "100.00",
      montant_ttc: "120.00",
      montant_net_ttc: null,
      devise: null,
      reste_du: null,
      statut_comptable: null,
      lignes: null,
    };
    const resultat = DocumentVenteSchema.parse(document);
    expect(resultat.devise).toBeNull();
  });

  it("rejette une échéance dont le champ obligatoire `id` est absent", () => {
    expect(() =>
      EcheanceSchema.parse({
        date: null,
        tiers_id: null,
        tiers_nom: null,
        tiers_code: null,
        document_id: null,
        document_numero: null,
        document_type: null,
        document_statut: null,
        mode_paiement: null,
        montant: null,
        devise: null,
        reste_du: null,
      }),
    ).toThrow();
  });

  it("accepte un règlement avec `tiers_id` toujours null (non fourni par la source)", () => {
    const reglement = {
      code: "REG-1",
      date: "2026-03-01",
      tiers_nom: "Client Démo",
      tiers_id: null,
      montant: "100.00",
      devise: null,
      montant_restant_a_affecter: null,
      mode_paiement_libelle: null,
      reference: null,
      type: "encaissement",
    };
    expect(() => ReglementSchema.parse(reglement)).not.toThrow();
  });
});

describe("enveloppeSchema / alignement T01 (point 13)", () => {
  it("valide l'exemple d'enveloppe de 07 §5 (Pagination, Meta, Enveloppe alignés avec T01)", () => {
    const exemple = {
      dossier: "demo-gc",
      resultats: [],
      pagination: { renvoyes: 0, total: null, total_source: 5000, hasMore: true, curseur: "opaque" },
      meta: {
        appels_api: 30,
        appels_auth: 0,
        duree_ms: 31000,
        quota_jour_restant: 9400,
        quota_utilisable: 8900,
        quota_estime: true,
        approximatif: true,
        completude: "partielle",
        raison_arret: "budget",
        sources: ["hubbix-gescom:/sale-documents"],
        avertissements: ["Budget atteint"],
        mode: "mock",
        observe_a: "2026-10-06T12:00:00Z",
      },
    };
    const schema = enveloppeSchema(ExerciceSchema);
    expect(() => schema.parse(exemple)).not.toThrow();
    expect(() => PaginationSchema.parse(exemple.pagination)).not.toThrow();
    expect(() => MetaSchema.parse(exemple.meta)).not.toThrow();
  });

  it("valide une erreur métier stable (07 §5/§7)", () => {
    const erreur = {
      code: "DOSSIER_REQUIRED",
      message: "Dossier requis",
      action: "Fournir un dossier",
    };
    expect(() => ErreurMetierSchema.parse(erreur)).not.toThrow();
  });
});
