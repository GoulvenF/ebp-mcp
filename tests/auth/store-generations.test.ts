import { describe, expect, it } from "vitest";
import {
  apresLogout,
  apresReservation,
  commitAutorise,
  etatGenerationsInitial,
  nomVerrouIdentite,
} from "../../dist/index.js";

describe("store-generations.ts — fonctions pures (décision 3)", () => {
  it("etatGenerationsInitial démarre à 0/0", () => {
    expect(etatGenerationsInitial()).toEqual({ schemaVersion: 1, derniereReservee: 0, revoqueeJusqua: 0 });
  });

  it("apresReservation incrémente derniereReservee et conserve revoqueeJusqua", () => {
    const etat = apresReservation({ schemaVersion: 1, derniereReservee: 3, revoqueeJusqua: 1 });
    expect(etat).toEqual({ schemaVersion: 1, derniereReservee: 4, revoqueeJusqua: 1 });
  });

  it("apresReservation(null) part de l'état initial", () => {
    expect(apresReservation(null)).toEqual({ schemaVersion: 1, derniereReservee: 1, revoqueeJusqua: 0 });
  });

  it("apresLogout relève revoqueeJusqua à derniereReservee, sans la modifier", () => {
    const etat = apresLogout({ schemaVersion: 1, derniereReservee: 5, revoqueeJusqua: 2 });
    expect(etat).toEqual({ schemaVersion: 1, derniereReservee: 5, revoqueeJusqua: 5 });
  });

  it("commitAutorise : G > revoqueeJusqua ET G === derniereReservee, sinon refusé", () => {
    const etat = { schemaVersion: 1 as const, derniereReservee: 4, revoqueeJusqua: 2 };
    expect(commitAutorise(etat, 4)).toBe(true);
    expect(commitAutorise(etat, 3)).toBe(false); // pas la dernière réservée
    expect(commitAutorise(etat, 2)).toBe(false); // invalidée (revoqueeJusqua)
    expect(commitAutorise(etat, 5)).toBe(false); // jamais réservée
  });

  it("commitAutorise(null, G) refuse toujours : en pratique la réservation a déjà persisté l'état avant le commit", () => {
    // `etatGenerationsInitial()` a derniereReservee=0 ; aucune génération réservée (G >= 1) ne
    // peut donc jamais correspondre, par construction sûre (refuser plutôt que supposer).
    expect(commitAutorise(null, 1)).toBe(false);
    expect(commitAutorise(null, 0)).toBe(false); // 0 > revoqueeJusqua(0) est faux
  });

  it("nomVerrouIdentite est déterministe, dérivé par hachage, conforme au motif de nom de verrou", () => {
    const nom = nomVerrouIdentite("default.prod.abcdef0123456789");
    expect(nom).toMatch(/^auth-[a-z0-9]{32}$/);
    expect(nomVerrouIdentite("default.prod.abcdef0123456789")).toBe(nom);
    expect(nomVerrouIdentite("autre.prod.abcdef0123456789")).not.toBe(nom);
  });
});
