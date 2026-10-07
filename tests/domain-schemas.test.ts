import { describe, expect, it } from "vitest";
import {
  enveloppeSchema,
  ErreurMetierSchema,
  ExerciceSchema,
  MetaSchema,
  PaginationSchema,
  TiersSchema,
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
