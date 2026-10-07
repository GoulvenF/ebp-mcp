import { describe, expect, it } from "vitest";
import { identiteStore } from "../../dist/config/index.js";

describe("store-identity.ts", () => {
  it("quatre combinaisons (deux profils × deux environnements) donnent quatre clés et répertoires distincts", () => {
    const clientId = "00000000-0000-4000-8000-000000000000";
    const combinaisons = [
      identiteStore("/racine", "profil-a", "prod", clientId),
      identiteStore("/racine", "profil-a", "preprod", clientId),
      identiteStore("/racine", "profil-b", "prod", clientId),
      identiteStore("/racine", "profil-b", "preprod", clientId),
    ];
    const cles = combinaisons.map((c) => c.cle);
    const repertoires = combinaisons.map((c) => c.repertoire);
    expect(new Set(cles).size).toBe(4);
    expect(new Set(repertoires).size).toBe(4);
  });

  it("un clientId différent donne une clé différente", () => {
    const a = identiteStore("/racine", "profil-a", "prod", "client-1");
    const b = identiteStore("/racine", "profil-a", "prod", "client-2");
    expect(a.cle).not.toBe(b.cle);
    expect(a.repertoire).not.toBe(b.repertoire);
  });

  it("mêmes entrées ⇒ même clé (stable)", () => {
    const a = identiteStore("/racine", "profil-a", "prod", "client-1");
    const b = identiteStore("/racine", "profil-a", "prod", "client-1");
    expect(a.cle).toBe(b.cle);
    expect(a.repertoire).toBe(b.repertoire);
  });

  it("ni le clientId ni un secret n'apparaissent dans cle ou repertoire", () => {
    const clientId = "secret-client-id-unique-xyz";
    const { cle, repertoire } = identiteStore("/racine", "profil-a", "prod", clientId);
    expect(cle.includes(clientId)).toBe(false);
    expect(repertoire.includes(clientId)).toBe(false);
  });

  it("prod et preprod du même profil ne partagent aucun chemin", () => {
    const prod = identiteStore("/racine", "profil-a", "prod", "client-1");
    const preprod = identiteStore("/racine", "profil-a", "preprod", "client-1");
    expect(prod.repertoire).not.toBe(preprod.repertoire);
    expect(preprod.repertoire.startsWith(prod.repertoire)).toBe(false);
    expect(prod.repertoire.startsWith(preprod.repertoire)).toBe(false);
  });
});
