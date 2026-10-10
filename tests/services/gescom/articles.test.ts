import { describe, expect, it } from "vitest";
import { ficheArticle, rechercherArticles } from "../../../dist/index.js";
import { ctxComptaSurOutilGc, ctxGescom, depsService } from "./fixtures.js";

const PAGE_VIDE = { elements: [], take: 50, skip: 0, total: 0 };

function article(id: string, code: string, type: "GoodItem" | "ServiceItem" = "GoodItem") {
  return {
    id,
    code,
    label: `Libellé ${code}`,
    itemType: type,
    priceVatExcluded: "10.00",
    priceVatIncluded: "12.00",
    vatRate: "20",
    itemStatus: 0,
  };
}

describe("services/gescom/articles.ts — garde de famille (D-T11-1)", () => {
  it("rechercher_articles sur dossier CPT ⇒ UNSUPPORTED_CAPABILITY, 0 appel transport", async () => {
    const d = depsService([]);
    await expect(rechercherArticles(d, ctxComptaSurOutilGc(), {})).rejects.toMatchObject({
      erreur: { code: "UNSUPPORTED_CAPABILITY" },
    });
    expect(d.transport.appels).toHaveLength(0);
  });

  it("fiche_article sur dossier CPT ⇒ UNSUPPORTED_CAPABILITY, 0 appel transport", async () => {
    const d = depsService([]);
    await expect(ficheArticle(d, ctxComptaSurOutilGc(), { code: "ART1" })).rejects.toMatchObject({
      erreur: { code: "UNSUPPORTED_CAPABILITY" },
    });
    expect(d.transport.appels).toHaveLength(0);
  });

  it("rechercher_articles.avec_stock: true ⇒ UNSUPPORTED_CAPABILITY, 0 appel transport", async () => {
    const d = depsService([]);
    await expect(rechercherArticles(d, ctxGescom(), { avec_stock: true })).rejects.toMatchObject({
      erreur: { code: "UNSUPPORTED_CAPABILITY" },
    });
    expect(d.transport.appels).toHaveLength(0);
  });
});

describe("services/gescom/articles.ts — fiche_article par code (D-T11-3)", () => {
  it("code ambigu (deux correspondances exactes) ⇒ AMBIGUOUS_REFERENCE", async () => {
    const page = { elements: [article("a1", "DUP"), article("a2", "DUP")], take: 2, skip: 0, total: 2 };
    const d = depsService([{ status: 200, corps: page }]);
    await expect(ficheArticle(d, ctxGescom(), { code: "DUP" })).rejects.toMatchObject({
      erreur: { code: "AMBIGUOUS_REFERENCE" },
    });
  });

  it("code introuvable après un scan complet ⇒ NOT_FOUND", async () => {
    const page = { elements: [article("a1", "AUTRE")], take: 2, skip: 0, total: 1 };
    const d = depsService([{ status: 200, corps: page }]);
    await expect(ficheArticle(d, ctxGescom(), { code: "INTROUVABLE" })).rejects.toMatchObject({
      erreur: { code: "NOT_FOUND" },
    });
  });

  it("scan interrompu par budget avant conclusion ⇒ RESOLUTION_INCOMPLETE, jamais NOT_FOUND", async () => {
    const page1 = { elements: [article("a1", "AUTRE1")], take: 2, skip: 0, total: 4 };
    const d = depsService([{ status: 200, corps: page1 }]);
    await expect(
      ficheArticle(d, ctxGescom({ budgetRestant: 1 }), { code: "INTROUVABLE" }),
    ).rejects.toMatchObject({ erreur: { code: "RESOLUTION_INCOMPLETE" } });
  });

  it("type `inconnu` sur l'élément trouvé ⇒ UNSUPPORTED_CAPABILITY, aucune requête de détail supplémentaire", async () => {
    const page = { elements: [article("a1", "ART1", "BundleItem" as never)], take: 2, skip: 0, total: 1 };
    const d = depsService([{ status: 200, corps: page }]);
    await expect(ficheArticle(d, ctxGescom(), { code: "ART1" })).rejects.toMatchObject({
      erreur: { code: "UNSUPPORTED_CAPABILITY" },
    });
    expect(d.transport.appels).toHaveLength(1);
  });
});

describe("services/gescom/articles.ts — rechercher_articles : filtres locaux, inclure_brut", () => {
  it("`inclure_brut: true` ⇒ `bruts` aligné 1:1 avec `resultats` ; `false` ⇒ `bruts: null`", async () => {
    const page = { elements: [article("a1", "ART1")], take: 50, skip: 0, total: 1 };
    const d1 = depsService([{ status: 200, corps: page }]);
    const resAvecBrut = await rechercherArticles(d1, ctxGescom(), { inclure_brut: true });
    expect(resAvecBrut.bruts).toHaveLength(resAvecBrut.resultats.length);
    expect(resAvecBrut.bruts![0]).toMatchObject({ id: "a1" });

    const d2 = depsService([{ status: 200, corps: page }]);
    const resSansBrut = await rechercherArticles(d2, ctxGescom(), { inclure_brut: false });
    expect(resSansBrut.bruts).toBeNull();
  });

  it("`texte` vide ou blanc ⇒ INVALID_ARGUMENT, 0 appel transport", async () => {
    const d = depsService([]);
    await expect(rechercherArticles(d, ctxGescom(), { texte: "   " })).rejects.toMatchObject({
      erreur: { code: "INVALID_ARGUMENT" },
    });
    expect(d.transport.appels).toHaveLength(0);
  });
});
