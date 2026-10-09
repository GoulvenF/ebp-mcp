import { describe, expect, it } from "vitest";
import { lireArticleBien, lireArticleService, listerArticles } from "../../../dist/index.js";
import { budgetDe, contexteGescom, deps, fixtureParId } from "./fixtures.js";

describe("hubbix-gescom/articles.ts — critère #1 : /items normalisé", () => {
  it("liste élémentaire : type service, décimaux source préservés, total_source distinct de renvoyés", async () => {
    const fixture = fixtureParId("gescom-items-liste-elements");
    const parametres = fixture.requete_attendue.parametres as { skip: number; take: number };
    const d = deps([{ status: fixture.reponse_ebp.statut_http, corps: fixture.reponse_ebp.corps }]);

    const page = await listerArticles(d, budgetDe(), contexteGescom(), {
      skip: parametres.skip,
      take: parametres.take,
    });

    expect(page.resultats).toEqual(fixture.attentes.resultats);
    expect(page.renvoyes).toBe(fixture.attentes.pagination!.renvoyes);
    expect(page.total_source).toBe(fixture.attentes.pagination!.total_source);
    expect(page.avertissements).toEqual(fixture.attentes.avertissements);
    expect(d.transport.appels).toHaveLength(1);
    expect(d.transport.appels[0]!.url).toContain("/hubbix-gctpe/api/public/v1/items");
  });

  it("page vide : ni erreur ni total inventé", async () => {
    const fixture = fixtureParId("gescom-items-page-vide");
    const parametres = fixture.requete_attendue.parametres as { skip: number; take: number };
    const d = deps([{ status: fixture.reponse_ebp.statut_http, corps: fixture.reponse_ebp.corps }]);

    const page = await listerArticles(d, budgetDe(), contexteGescom(), {
      skip: parametres.skip,
      take: parametres.take,
    });

    expect(page.resultats).toEqual([]);
    expect(page.renvoyes).toBe(0);
    expect(page.total_source).toBe(fixture.attentes.pagination!.total_source);
  });

  it("précision décimale (~28 chiffres) : prix et taux restitués sans arrondi", async () => {
    const fixture = fixtureParId("gescom-items-decimal-precision");
    const parametres = fixture.requete_attendue.parametres as { skip: number; take: number };
    const d = deps([{ status: fixture.reponse_ebp.statut_http, corps: fixture.reponse_ebp.corps }]);

    const page = await listerArticles(d, budgetDe(), contexteGescom(), {
      skip: parametres.skip,
      take: parametres.take,
    });

    expect(page.resultats).toEqual(fixture.attentes.resultats);
  });

  it("`skip` renvoyé différent de `skip` demandé ⇒ UPSTREAM_PAGINATION_INVALID, aucun résultat renvoyé", async () => {
    const fixture = fixtureParId("gescom-items-pagination-invalide");
    const parametres = fixture.requete_attendue.parametres as { skip: number; take: number };
    const d = deps([{ status: fixture.reponse_ebp.statut_http, corps: fixture.reponse_ebp.corps }]);

    await expect(
      listerArticles(d, budgetDe(), contexteGescom(), { skip: parametres.skip, take: parametres.take }),
    ).rejects.toMatchObject({ erreur: { code: fixture.attentes.erreur!.code } });
  });

  it("401 fournisseur après rejeu unique : AUTH_REQUIRED, jamais un succès vide", async () => {
    const fixture = fixtureParId("gescom-items-erreur-401");
    const parametres = fixture.requete_attendue.parametres as { skip: number; take: number };
    const reponse401 = { status: fixture.reponse_ebp.statut_http, corps: fixture.reponse_ebp.corps };
    const d = deps([reponse401, reponse401]);

    await expect(
      listerArticles(d, budgetDe(), contexteGescom(), { skip: parametres.skip, take: parametres.take }),
    ).rejects.toMatchObject({ erreur: { code: "AUTH_REQUIRED" } });
    expect(d.transport.appels).toHaveLength(2);
  });

  it("`take` hors de [1,100] : refusé avant tout réseau", async () => {
    const d = deps([]);
    await expect(
      listerArticles(d, budgetDe(), contexteGescom(), { skip: 0, take: 101 }),
    ).rejects.toMatchObject({ erreur: { code: "INVALID_ARGUMENT" } });
    expect(d.transport.appels).toHaveLength(0);
  });
});

describe("hubbix-gescom/articles.ts — critère #3 : itemType hors énumération", () => {
  it("valeur itemType inconnue ⇒ `inconnu` + avertissement citant la valeur source, zéro valeur inventée", async () => {
    const d = deps([
      {
        status: 200,
        corps: {
          elements: [
            {
              id: "art-99",
              code: "ART099",
              label: "Lot mixte",
              itemType: "BundleItem",
              priceVatExcluded: "42.00",
              priceVatIncluded: "50.40",
              vatRate: "20",
              itemStatus: 0,
            },
          ],
          take: 50,
          skip: 0,
          total: 1,
        },
      },
    ]);

    const page = await listerArticles(d, budgetDe(), contexteGescom(), { skip: 0, take: 50 });

    expect(page.resultats).toEqual([
      {
        id: "art-99",
        code: "ART099",
        libelle: "Lot mixte",
        type: "inconnu",
        prix_ht: "42",
        prix_ttc: "50.4",
        taux_tva: "20",
        devise: null,
        actif: true,
      },
    ]);
    expect(page.avertissements).toHaveLength(1);
    expect(page.avertissements[0]).toContain("BundleItem");
  });
});

describe("hubbix-gescom/articles.ts — critère #2 : détail bien/service, routes distinctes, pas de fallback", () => {
  it("détail bien (`/items/goods/{id}`) conforme à la fixture", async () => {
    const fixture = fixtureParId("gescom-item-good-detail");
    const d = deps([{ status: fixture.reponse_ebp.statut_http, corps: fixture.reponse_ebp.corps }]);

    const { resultat, avertissements } = await lireArticleBien(d, budgetDe(), contexteGescom(), "art-10");

    expect(resultat).toEqual(fixture.attentes.resultats[0]);
    expect(avertissements).toEqual(fixture.attentes.avertissements);
    expect(d.transport.appels).toHaveLength(1);
    expect(d.transport.appels[0]!.url).toContain("/items/goods/art-10");
  });

  it("détail service (`/items/services/{id}`) conforme à la fixture, route distincte de celle des biens", async () => {
    const fixture = fixtureParId("gescom-item-service-detail");
    const d = deps([{ status: fixture.reponse_ebp.statut_http, corps: fixture.reponse_ebp.corps }]);

    const { resultat, avertissements } = await lireArticleService(d, budgetDe(), contexteGescom(), "srv-7");

    expect(resultat).toEqual(fixture.attentes.resultats[0]);
    expect(avertissements).toEqual(fixture.attentes.avertissements);
    expect(d.transport.appels[0]!.url).toContain("/items/services/srv-7");
  });

  it("404 sur le détail bien : NOT_FOUND, une seule émission, aucun essai de /items/services/{id}", async () => {
    const d = deps([{ status: 404, corps: { status: 404, errorCode: "Item.NotFound" } }]);

    await expect(lireArticleBien(d, budgetDe(), contexteGescom(), "inconnu-1")).rejects.toMatchObject({
      erreur: { code: "NOT_FOUND" },
    });
    expect(d.transport.appels).toHaveLength(1);
    expect(d.transport.appels[0]!.url).toContain("/items/goods/inconnu-1");
  });

  it("404 sur le détail service : NOT_FOUND, une seule émission, aucun essai de /items/goods/{id}", async () => {
    const d = deps([{ status: 404, corps: { status: 404, errorCode: "Item.NotFound" } }]);

    await expect(lireArticleService(d, budgetDe(), contexteGescom(), "inconnu-2")).rejects.toMatchObject({
      erreur: { code: "NOT_FOUND" },
    });
    expect(d.transport.appels).toHaveLength(1);
    expect(d.transport.appels[0]!.url).toContain("/items/services/inconnu-2");
  });
});
