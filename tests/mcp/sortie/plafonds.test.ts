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
  it("une enveloppe qui dépasse encore le plafond même après avoir omis le brut donne RESPONSE_TOO_LARGE", () => {
    const gros = "x".repeat(PLAFOND_SORTIE_OCTETS + 1);
    const enveloppe = { ...enveloppeDe([{ texte: gros }]), bruts: [gros] };
    expect(() => verifierPlafondFinal(enveloppe)).toThrowError();
  });

  it("resultats et bruts restent chacun sous 1 Mio mais dépassent le plafond ensemble : le brut est omis avec avertissement, pas d'erreur (précision Lead Tech)", () => {
    const texteResultats = "x".repeat(700_000);
    const texteBrut = "y".repeat(700_000);
    const enveloppe = { ...enveloppeDe([{ texte: texteResultats }]), bruts: [texteBrut] };
    const finale = verifierPlafondFinal(enveloppe) as typeof enveloppe;
    expect(finale.bruts).toBeNull();
    expect(finale.meta.avertissements).toContain("brut omis : plafond 1 Mio");
  });

  it("une enveloppe sans bruts qui dépasse le plafond donne RESPONSE_TOO_LARGE (rien à omettre)", () => {
    const gros = "x".repeat(PLAFOND_SORTIE_OCTETS + 1);
    const enveloppe = enveloppeDe([{ texte: gros }]);
    expect(() => verifierPlafondFinal(enveloppe)).toThrowError();
  });
});
