// Garde réseau (D-T13-13, fiche T13) : chargée par `node --import` dans chaque processus CLI
// enfant des tests d'acceptation. Patché sur `globalThis.fetch` (seul point d'émission HTTP
// sortante côté production : `src/http/transport-fetch.ts`, `src/mock/consentement.ts`) ET sur
// `net.Socket.prototype.connect`/`net.connect`/`net.createConnection`, `tls.connect` et
// `dns.lookup`/`dns.resolve*`, pour couvrir toute voie d'émission sortante que Node expose, même
// une qu'aucun code de production n'utilise aujourd'hui — la garde ne doit pas dépendre de la
// connaissance des call sites actuels. `src/auth/callback-loopback.ts` ne fait qu'écouter
// (`http.createServer`), jamais une émission sortante, donc rien à patcher côté serveur.
//
// Toute origine loopback (127.0.0.1/::1/localhost) reste autorisée (callback OAuth local, GET de
// consentement simulé) ; toute AUTRE origine est bloquée ET enregistrée dans le fichier désigné
// par `EBP_MCP_TEST_GARDE_FICHIER` (une ligne par tentative), pour que le test parent, après la fin
// du processus enfant, puisse affirmer qu'aucune tentative n'a eu lieu.
import { appendFileSync } from "node:fs";
import net from "node:net";
import tls from "node:tls";
import dns from "node:dns";

const fichier = process.env.EBP_MCP_TEST_GARDE_FICHIER;

function estHoteLoopback(hote) {
  return hote === "127.0.0.1" || hote === "::1" || hote === "localhost";
}

function estLoopback(url) {
  try {
    return estHoteLoopback(new URL(url).hostname);
  } catch {
    return false;
  }
}

function enregistrerTentative(cible) {
  if (fichier === undefined) return;
  appendFileSync(fichier, `${cible}\n`);
}

function bloquer(cible) {
  enregistrerTentative(cible);
  throw new Error(`Garde réseau (tests) : émission bloquée vers ${cible}`);
}

const fetchOriginal = globalThis.fetch;

globalThis.fetch = async function fetchGarde(entree, init) {
  const url = typeof entree === "string" ? entree : entree instanceof URL ? entree.toString() : entree.url;
  if (!estLoopback(url)) {
    bloquer(url);
  }
  return fetchOriginal(entree, init);
};

function hoteConnexion(options) {
  if (typeof options === "object" && options !== null) {
    return options.host ?? options.hostname ?? "127.0.0.1";
  }
  return "127.0.0.1";
}

const netConnectOriginal = net.connect;
const netCreateConnectionOriginal = net.createConnection;
const socketConnectOriginal = net.Socket.prototype.connect;

function netConnectGarde(...args) {
  const hote = typeof args[0] === "number" ? (args[1] ?? "127.0.0.1") : hoteConnexion(args[0]);
  if (!estHoteLoopback(hote)) {
    bloquer(`net:${hote}`);
  }
  return netConnectOriginal.apply(net, args);
}

net.connect = netConnectGarde;
net.createConnection = function createConnectionGarde(...args) {
  const hote = typeof args[0] === "number" ? (args[1] ?? "127.0.0.1") : hoteConnexion(args[0]);
  if (!estHoteLoopback(hote)) {
    bloquer(`net:${hote}`);
  }
  return netCreateConnectionOriginal.apply(net, args);
};
net.Socket.prototype.connect = function connectGarde(...args) {
  const hote = typeof args[0] === "number" ? (args[1] ?? "127.0.0.1") : hoteConnexion(args[0]);
  if (!estHoteLoopback(hote)) {
    bloquer(`net:${hote}`);
    return this;
  }
  return socketConnectOriginal.apply(this, args);
};

const tlsConnectOriginal = tls.connect;
tls.connect = function tlsConnectGarde(...args) {
  const hote = typeof args[0] === "number" ? (args[1] ?? "127.0.0.1") : hoteConnexion(args[0]);
  if (!estHoteLoopback(hote)) {
    bloquer(`tls:${hote}`);
  }
  return tlsConnectOriginal.apply(tls, args);
};

const dnsLookupOriginal = dns.lookup;
dns.lookup = function lookupGarde(hostname, ...reste) {
  if (!estHoteLoopback(hostname)) {
    bloquer(`dns:${hostname}`);
  }
  return dnsLookupOriginal.call(dns, hostname, ...reste);
};

for (const methode of ["resolve", "resolve4", "resolve6", "resolveCname", "resolveMx", "resolveTxt"]) {
  const original = dns[methode];
  if (typeof original !== "function") continue;
  dns[methode] = function resolveGarde(hostname, ...reste) {
    if (!estHoteLoopback(hostname)) {
      bloquer(`dns:${hostname}`);
    }
    return original.call(dns, hostname, ...reste);
  };
}
