import { describe, expect, it } from "vitest";
import { PLAFOND_SORTIE_OCTETS, verifierPlafondFiche, verifierPlafondFinal } from "../../../dist/index.js";
import type { Enveloppe, Pagination } from "../../../dist/index.js";

function enveloppeDe(resultats: unknown[], pagination: Pagination | null = null): Enveloppe<unknown> {
  return { dossier: "d1", resultats, pagination, meta: { avertissements: [] as string[] } as Enveloppe<unknown>["meta"] };
}

describe("verifierPlafondFiche — D-T12-9", () => {
  it("fiche de plus de 1 Mio (pagination: null) : RESPONSE_TOO_LARGE", () => {
    const gros = "x".repeat(PLAFOND_SORTIE_OCTETS + 1);
    expect(() => verifierPlafondFiche(enveloppeDe([{ texte: gros }]))).toThrowError();
    try {
      verifierPlafondFiche(enveloppeDe([{ texte: gros }]));
    } catch (e) {
      expect((e as { erreur: { code: string } }).erreur.code).toBe("RESPONSE_TOO_LARGE");
    }
  });

  it("une liste paginée (pagination non nulle) n'est jamais soumise à ce plafond de fiche", () => {
    const gros = "x".repeat(PLAFOND_SORTIE_OCTETS + 1);
    expect(() =>
      verifierPlafondFiche(enveloppeDe([{ texte: gros }], { renvoyes: 1, total: null, total_source: null, hasMore: false, curseur: null })),
    ).not.toThrow();
  });

  it("une fiche sous le plafond ne lève rien", () => {
    expect(() => verifierPlafondFiche(enveloppeDe([{ texte: "petit" }]))).not.toThrow();
  });
});

describe("verifierPlafondFinal — garde finale du sérialiseur (D-T12-9)", () => {
  it("une enveloppe qui dépasse encore le plafond, brut compris, donne RESPONSE_TOO_LARGE", () => {
    const gros = "x".repeat(PLAFOND_SORTIE_OCTETS + 1);
    const enveloppe = { ...enveloppeDe([{ id: "1" }]), bruts: [gros] };
    expect(() => verifierPlafondFinal(enveloppe)).toThrowError();
  });
});
