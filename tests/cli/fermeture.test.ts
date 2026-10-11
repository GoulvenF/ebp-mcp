import { describe, expect, it } from "vitest";
import { fermerAvecDelai } from "../../dist/cli/fermeture.js";

describe("fermerAvecDelai (D-T13-12)", () => {
  it("rend true quand la fermeture se règle avant le délai", async () => {
    const resultat = await fermerAvecDelai(() => Promise.resolve(), 50);
    expect(resultat).toBe(true);
  });

  it("rend false quand la fermeture ne se règle jamais avant le délai (serve, >5s)", async () => {
    const jamaisReglee = (): Promise<void> => new Promise(() => undefined);
    const resultat = await fermerAvecDelai(jamaisReglee, 20);
    expect(resultat).toBe(false);
  });

  it("rend true même si la fermeture rejette, pourvu que ce soit avant le délai", async () => {
    const resultat = await fermerAvecDelai(() => Promise.reject(new Error("échec de fermeture")), 50);
    expect(resultat).toBe(true);
  });
});
