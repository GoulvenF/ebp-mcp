// Critère d'acceptation #5 (GOU-371, T13-1) : refus et erreurs de `creerTransportMock`, sans
// aucune émission réseau réelle (espion de `globalThis.fetch`, jamais appelé).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  JEU_CPT_DEMO,
  JEU_GC_DEMO,
  MESSAGE_ORIGINE_REFUSEE,
  TENANT_ID_DEMO_CPT,
  creerTransportMock,
  origineMetier,
} from "../../dist/index.js";
import type { JeuMock } from "../../dist/index.js";

const JEU: JeuMock = { cpt: JEU_CPT_DEMO, gc: JEU_GC_DEMO };

describe("creerTransportMock (D-T13-5, critère #5)", () => {
  let espionFetch: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    espionFetch = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    espionFetch.mockRestore();
  });

  it("une origine non EBP est rejetée sans jamais appeler `fetch`", async () => {
    const transport = creerTransportMock(JEU);
    await expect(
      transport.request({ method: "GET", url: "https://exemple-tiers.invalid/quelque-chose" }),
    ).rejects.toThrow(MESSAGE_ORIGINE_REFUSEE);
    expect(espionFetch).not.toHaveBeenCalled();
  });

  it("un POST métier est rejeté (aucun POST n'est jamais autorisé sur l'origine métier)", async () => {
    const transport = creerTransportMock(JEU);
    const url = `${origineMetier("prod")}/hubbix-cpttpe/api/v1/domain-information`;
    await expect(transport.request({ method: "POST", url })).rejects.toThrow(MESSAGE_ORIGINE_REFUSEE);
    expect(espionFetch).not.toHaveBeenCalled();
  });

  it("un tenant/domaine inconnu donne un 404 synthétique au format EBP", async () => {
    const transport = creerTransportMock(JEU);
    const url = `${origineMetier("prod")}/hubbix-cpttpe/api/v1/domain-information`;
    const reponse = await transport.request({
      method: "GET",
      url,
      headers: { Authorization: "Bearer mock-at-abc", TenantId: "99999999-0000-0000-0000-000000000000" },
    });
    expect(reponse.status).toBe(404);
    const corps = JSON.parse(reponse.body) as { status: number; errorCode: string };
    expect(corps).toMatchObject({ status: 404, errorCode: "NotFound" });
    expect(espionFetch).not.toHaveBeenCalled();
  });

  it("l'absence d'un `Authorization: Bearer mock-at-…` donne un 401 synthétique", async () => {
    const transport = creerTransportMock(JEU);
    const url = `${origineMetier("prod")}/hubbix-cpttpe/api/v1/domain-information`;
    const reponse = await transport.request({
      method: "GET",
      url,
      headers: { TenantId: TENANT_ID_DEMO_CPT },
    });
    expect(reponse.status).toBe(401);
    const corps = JSON.parse(reponse.body) as { status: number; errorCode: string };
    expect(corps.status).toBe(401);
    expect(espionFetch).not.toHaveBeenCalled();
  });

  it("un token mal préfixé (pas `mock-at-…`) donne aussi un 401", async () => {
    const transport = creerTransportMock(JEU);
    const url = `${origineMetier("prod")}/hubbix-cpttpe/api/v1/domain-information`;
    const reponse = await transport.request({
      method: "GET",
      url,
      headers: { Authorization: "Bearer un-vrai-jwt", TenantId: TENANT_ID_DEMO_CPT },
    });
    expect(reponse.status).toBe(401);
  });

  it("une route non répertoriée (chemin inconnu) est rejetée avant toute réponse HTTP simulée", async () => {
    const transport = creerTransportMock(JEU);
    const url = `${origineMetier("prod")}/hubbix-cpttpe/api/v1/route-inexistante`;
    await expect(
      transport.request({ method: "GET", url, headers: { Authorization: "Bearer mock-at-x", TenantId: TENANT_ID_DEMO_CPT } }),
    ).rejects.toThrow(MESSAGE_ORIGINE_REFUSEE);
  });

  it("une fiche CPT connue (`/domain-information`) répond 200 avec le corps attendu", async () => {
    const transport = creerTransportMock(JEU);
    const url = `${origineMetier("prod")}/hubbix-cpttpe/api/v1/domain-information`;
    const reponse = await transport.request({
      method: "GET",
      url,
      headers: { Authorization: "Bearer mock-at-x", TenantId: TENANT_ID_DEMO_CPT },
    });
    expect(reponse.status).toBe(200);
    expect(JSON.parse(reponse.body)).toEqual(JEU_CPT_DEMO.fiches["cpt-domain-information"]);
  });

  it("une liste GC (`/items`) applique skip/take et renvoie le wrapper `elements`/`total`", async () => {
    const transport = creerTransportMock(JEU);
    const url = `${origineMetier("prod")}/hubbix-gctpe/api/public/v1/items?take=10&skip=0`;
    const reponse = await transport.request({
      method: "GET",
      url,
      headers: { Authorization: "Bearer mock-at-x", DomainId: JEU_GC_DEMO.domainId },
    });
    expect(reponse.status).toBe(200);
    const corps = JSON.parse(reponse.body) as { elements: unknown[]; total: number; take: number; skip: number };
    expect(corps.elements).toHaveLength(10);
    expect(corps.total).toBe(JEU_GC_DEMO.listes["gc-items"]!.length);
  });
});
