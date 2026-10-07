import { describe, expect, it } from "vitest";
import type { LecteurConfig } from "../../dist/config/index.js";
import { chargerConfig } from "../../dist/config/index.js";
import { fichierBase, journalEspion, TENANT_ID_DEMO } from "./fixtures.js";

/** Lecteur injecté (décision 1, 07 §2) : aucun accès au disque réel dans ces tests. */
function lecteurAvec(contenu: string, modePosix: number | null): LecteurConfig {
  return {
    async lire(): Promise<{ contenu: string; modePosix: number | null } | null> {
      return { contenu, modePosix };
    },
  };
}

describe("chargerConfig : avertissement de permissions sur un fichier contenant un secret", () => {
  it("clientSecret lisible par tous (0644) ⇒ avertissement", async () => {
    const fichier = fichierBase() as any;
    fichier.profiles.default.clientSecret = "secret-de-test";
    const journal = journalEspion();
    await chargerConfig({
      lecteur: lecteurAvec(JSON.stringify(fichier), 0o644),
      env: {},
      home: "/home/test",
      cli: {},
      journal,
    });
    expect(journal.messages.some((m) => m.includes("permissions POSIX"))).toBe(true);
  });

  it("clé par famille (subscriptionByFamily) lisible par tous (0644) ⇒ avertissement", async () => {
    const fichier = fichierBase() as any;
    fichier.profiles.default.subscriptionByFamily = {
      "hubbix-compta": { key: "cle-famille", quotaGroup: "grp" },
    };
    const journal = journalEspion();
    await chargerConfig({
      lecteur: lecteurAvec(JSON.stringify(fichier), 0o644),
      env: {},
      home: "/home/test",
      cli: {},
      journal,
    });
    expect(journal.messages.some((m) => m.includes("permissions POSIX"))).toBe(true);
  });

  it("clé par famille, permissions restrictives (0600) ⇒ aucun avertissement", async () => {
    const fichier = fichierBase() as any;
    fichier.profiles.default.subscriptionByFamily = {
      "hubbix-compta": { key: "cle-famille", quotaGroup: "grp" },
    };
    const journal = journalEspion();
    await chargerConfig({
      lecteur: lecteurAvec(JSON.stringify(fichier), 0o600),
      env: {},
      home: "/home/test",
      cli: {},
      journal,
    });
    expect(journal.messages.some((m) => m.includes("permissions POSIX"))).toBe(false);
  });

  it("aucun secret, permissions larges (0644) ⇒ aucun avertissement", async () => {
    const fichier = fichierBase();
    const journal = journalEspion();
    const config = await chargerConfig({
      lecteur: lecteurAvec(JSON.stringify(fichier), 0o644),
      env: {},
      home: "/home/test",
      cli: {},
      journal,
    });
    expect(journal.messages.some((m) => m.includes("permissions POSIX"))).toBe(false);
    expect(config.dossiers.prod[0]?.id).toBe(TENANT_ID_DEMO);
  });
});
