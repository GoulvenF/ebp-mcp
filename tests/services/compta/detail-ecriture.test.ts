import { describe, expect, it } from "vitest";
import { detailEcriture } from "../../../dist/index.js";
import { ctxDe, ctxGcDe, depsDe } from "./fixtures.js";

const UUID = "660e8400-e29b-41d4-a716-446655440020";

const ENTRY_DETAIL = {
  uuid: UUID,
  journal: "VE",
  date: "2026-03-10",
  entryMode: "Validé",
  lines: [
    {
      generalAccount: "411000",
      auxiliaryAccount: "4010001",
      label: "Facture mars",
      debit: "250.00",
      credit: null,
      piece: "FA2026-020",
      document: null,
      deadline: "2026-04-10",
      lettering: null,
    },
  ],
};

describe("detail_ecriture (D-T11-16)", () => {
  it("dossier GC ⇒ UNSUPPORTED_CAPABILITY, 0 appel transport", async () => {
    const deps = depsDe([]);
    await expect(detailEcriture(deps, ctxGcDe(), { id: UUID })).rejects.toMatchObject({
      erreur: { code: "UNSUPPORTED_CAPABILITY" },
    });
    expect(deps.transport.appels).toHaveLength(0);
  });

  it("`id` non-UUID ⇒ INVALID_ARGUMENT avant réseau", async () => {
    const deps = depsDe([]);
    await expect(detailEcriture(deps, ctxDe(), { id: "pas-un-uuid" })).rejects.toMatchObject({
      erreur: { code: "INVALID_ARGUMENT" },
    });
    expect(deps.transport.appels).toHaveLength(0);
  });

  it("dossier GC + entrée invalide ⇒ INVALID_ARGUMENT (schéma avant famille, 07 §4), 0 appel transport", async () => {
    const deps = depsDe([]);
    await expect(detailEcriture(deps, ctxGcDe(), { id: "x" })).rejects.toMatchObject({
      erreur: { code: "INVALID_ARGUMENT" },
    });
    expect(deps.transport.appels).toHaveLength(0);
  });

  it("UUID validé ⇒ lecture directe `/entries/{uuid}`, 1 appel", async () => {
    const deps = depsDe([{ status: 200, corps: ENTRY_DETAIL }]);
    const resultat = await detailEcriture(deps, ctxDe(), { id: UUID });
    expect(deps.transport.appels).toHaveLength(1);
    expect(deps.transport.appels[0]!.url).toContain(UUID);
    expect(resultat.resultats[0]!.id).toBe(UUID);
    expect(resultat.resultats[0]!.lignes).toHaveLength(1);
  });

  it("404 ⇒ NOT_FOUND", async () => {
    const deps = depsDe([{ status: 404, corps: { message: "introuvable" } }]);
    await expect(detailEcriture(deps, ctxDe(), { id: UUID })).rejects.toMatchObject({
      erreur: { code: "NOT_FOUND" },
    });
  });

  it("`inclure_brut: true` ⇒ bruts aligné 1:1 (1 résultat, 1 brut)", async () => {
    const deps = depsDe([{ status: 200, corps: ENTRY_DETAIL }]);
    const resultat = await detailEcriture(deps, ctxDe(), { id: UUID, inclure_brut: true });
    expect(resultat.bruts).toHaveLength(1);
  });

  it("`inclure_brut: false` (défaut) ⇒ bruts null", async () => {
    const deps = depsDe([{ status: 200, corps: ENTRY_DETAIL }]);
    const resultat = await detailEcriture(deps, ctxDe(), { id: UUID });
    expect(resultat.bruts).toBeNull();
  });
});
