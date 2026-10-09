import { describe, expect, it } from "vitest";
import { attendreCallback } from "../../dist/index.js";
import { creerHorlogeControlee, portLibre } from "./fixtures.js";

async function requeteGet(url: string): Promise<{ status: number; corps: string }> {
  const reponse = await fetch(url);
  return { status: reponse.status, corps: await reponse.text() };
}

describe("callback-loopback.ts", () => {
  it("critère #1 : state inconnu refusé, ne consomme pas le state valide, le callback suivant aboutit", async () => {
    const clock = creerHorlogeControlee(new Date());
    const port = await portLibre();
    const redirectUri = `http://127.0.0.1:${port}/callback`;

    const promesse = attendreCallback({ clock }, redirectUri, "state-valide", 60_000);

    const mauvais = await requeteGet(`${redirectUri}?state=state-inconnu&code=code-x`);
    expect(mauvais.status).toBe(400);

    const bon = await requeteGet(`${redirectUri}?state=state-valide&code=code-bon`);
    expect(bon.status).toBe(200);

    const resultat = await promesse;
    expect(resultat).toEqual({ code: "code-bon", state: "state-valide" });
  });

  it("critère #2 : un second callback (même state, même code) est refusé après le premier", async () => {
    const clock = creerHorlogeControlee(new Date());
    const port = await portLibre();
    const redirectUri = `http://127.0.0.1:${port}/callback`;

    const promesse = attendreCallback({ clock }, redirectUri, "state-unique", 60_000);

    const premier = await requeteGet(`${redirectUri}?state=state-unique&code=code-rejoue`);
    expect(premier.status).toBe(200);
    const resultat = await promesse;
    expect(resultat).toEqual({ code: "code-rejoue", state: "state-unique" });

    // Le serveur est fermé après résolution : la seconde requête ne peut plus être reçue.
    await expect(fetch(`${redirectUri}?state=state-unique&code=code-rejoue`)).rejects.toBeDefined();
  });

  it("critère #3 : erreur OAuth assainie, state consommé, aucun token présent dans la réponse", async () => {
    const clock = creerHorlogeControlee(new Date());
    const port = await portLibre();
    const redirectUri = `http://127.0.0.1:${port}/callback`;

    const promesse = attendreCallback({ clock }, redirectUri, "state-erreur", 60_000);
    // Attache le gestionnaire de rejet tout de suite (avant tout autre `await`) : le serveur peut
    // rejeter `promesse` pendant qu'on attend encore la réponse HTTP, et un attachement tardif
    // produirait un avertissement « unhandled rejection » bénin mais bruyant.
    const attenteRejet = expect(promesse).rejects.toMatchObject({
      erreur: { code: "AUTH_REQUIRED", details: { error: "access_denied" } },
    });

    const reponse = await requeteGet(
      `${redirectUri}?state=state-erreur&error=access_denied&error_description=secret-interne-a-ne-pas-fuiter`,
    );
    expect(reponse.status).toBe(200);
    expect(reponse.corps).not.toContain("secret-interne-a-ne-pas-fuiter");
    expect(reponse.corps).not.toMatch(/code=|token/i);

    await attenteRejet;
  });

  it("critère #4 : port déjà occupé ⇒ CONFIG_INVALID, aucun changement de port", async () => {
    const clock = creerHorlogeControlee(new Date());
    const port = await portLibre();
    const redirectUri = `http://127.0.0.1:${port}/callback`;

    const { createServer } = await import("node:http");
    const occupant = createServer((_req, res) => res.end("occupe"));
    await new Promise<void>((resolve) => occupant.listen(port, "127.0.0.1", resolve));

    try {
      await expect(attendreCallback({ clock }, redirectUri, "state", 5_000)).rejects.toMatchObject({
        erreur: { code: "CONFIG_INVALID", details: { port: String(port) } },
      });
    } finally {
      await new Promise<void>((resolve) => occupant.close(() => resolve()));
    }
  });

  it("critère #5 : aucun callback avant le timeout ⇒ erreur, serveur fermé, state inutilisable", async () => {
    const clock = creerHorlogeControlee(new Date());
    const port = await portLibre();
    const redirectUri = `http://127.0.0.1:${port}/callback`;

    const promesse = attendreCallback({ clock }, redirectUri, "state-timeout", 5_000);
    // Laisse le serveur réel finir son `listen()` (socket OS asynchrone) avant d'avancer l'horloge,
    // sinon l'attente du minuteur n'est pas encore enregistrée et `avancer()` ne la réveille pas.
    await new Promise((resolve) => setTimeout(resolve, 20));
    clock.avancer(5_000);

    await expect(promesse).rejects.toMatchObject({ erreur: { code: "AUTH_REQUIRED" } });

    // Le serveur est fermé : le port redevient immédiatement disponible.
    const { createServer } = await import("node:http");
    const verif = createServer();
    await new Promise<void>((resolve, reject) => {
      verif.once("error", reject);
      verif.listen(port, "127.0.0.1", resolve);
    });
    await new Promise<void>((resolve) => verif.close(() => resolve()));
  });

  it("requête sur une autre route ⇒ 404, ne consomme pas le state, le serveur continue d'écouter", async () => {
    const clock = creerHorlogeControlee(new Date());
    const port = await portLibre();
    const redirectUri = `http://127.0.0.1:${port}/callback`;

    const promesse = attendreCallback({ clock }, redirectUri, "state-route", 60_000);
    const autre = await requeteGet(`http://127.0.0.1:${port}/autre-route`);
    expect(autre.status).toBe(404);

    const bon = await requeteGet(`${redirectUri}?state=state-route&code=code-ok`);
    expect(bon.status).toBe(200);
    await expect(promesse).resolves.toEqual({ code: "code-ok", state: "state-route" });
  });

  it("réponse de succès : en-têtes no-store/no-referrer, aucun token ni code dans le corps", async () => {
    const clock = creerHorlogeControlee(new Date());
    const port = await portLibre();
    const redirectUri = `http://127.0.0.1:${port}/callback`;

    const promesse = attendreCallback({ clock }, redirectUri, "state-entetes", 60_000);
    const reponse = await fetch(`${redirectUri}?state=state-entetes&code=code-secret-xyz`);
    expect(reponse.headers.get("cache-control")).toBe("no-store");
    expect(reponse.headers.get("referrer-policy")).toBe("no-referrer");
    const corps = await reponse.text();
    expect(corps).not.toContain("code-secret-xyz");
    await promesse;
  });
});
