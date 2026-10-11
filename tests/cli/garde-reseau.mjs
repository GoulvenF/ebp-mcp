// Garde réseau (D-T13-13, fiche T13) : chargée par `node --import` dans chaque processus CLI
// enfant des tests d'acceptation. Patché uniquement sur `globalThis.fetch` : seul `fetch` natif
// est utilisé côté production (`src/http/transport-fetch.ts`, `src/mock/consentement.ts`) pour
// émettre une requête HTTP sortante ; `src/auth/callback-loopback.ts` ne fait qu'écouter
// (`http.createServer`), jamais une émission sortante, donc rien à patcher côté serveur.
//
// Toute origine loopback (127.0.0.1/::1/localhost) reste autorisée (callback OAuth local, GET de
// consentement simulé) ; toute AUTRE origine est bloquée ET enregistrée dans le fichier désigné
// par `EBP_MCP_TEST_GARDE_FICHIER` (une ligne par tentative), pour que le test parent, après la fin
// du processus enfant, puisse affirmer qu'aucune tentative n'a eu lieu.
import { appendFileSync } from "node:fs";

const fichier = process.env.EBP_MCP_TEST_GARDE_FICHIER;

function estLoopback(url) {
  try {
    const hote = new URL(url).hostname;
    return hote === "127.0.0.1" || hote === "::1" || hote === "localhost";
  } catch {
    return false;
  }
}

function enregistrerTentative(url) {
  if (fichier === undefined) return;
  appendFileSync(fichier, `${url}\n`);
}

const fetchOriginal = globalThis.fetch;

globalThis.fetch = async function fetchGarde(entree, init) {
  const url = typeof entree === "string" ? entree : entree instanceof URL ? entree.toString() : entree.url;
  if (!estLoopback(url)) {
    enregistrerTentative(url);
    throw new Error(`Garde réseau (tests) : émission bloquée vers ${url}`);
  }
  return fetchOriginal(entree, init);
};
