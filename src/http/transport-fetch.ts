import type { HttpRequestSpec, HttpResponseSpec, HttpTransport } from "../ports/http-transport.js";
import { erreurHoteNonAutorise, erreurMethodeRefusee, erreurReponseTropVolumineuse } from "./errors.js";

/** 5 Mio (décision 15) : plafond appliqué **en flux**, abort dès dépassement sans bufferiser la suite. */
export const PLAFOND_TAILLE_OCTETS = 5 * 1024 * 1024;

export interface ParametresTransportFetch {
  /** Origines (schéma+hôte) acceptées : origine métier de l'environnement + hôte identité (décision 16). */
  readonly originesAutorisees: readonly string[];
}

function origineDe(url: string): string | null {
  try {
    const analysee = new URL(url);
    return `${analysee.protocol}//${analysee.host}`;
  } catch {
    return null;
  }
}

async function lireCorpsAvecPlafond(flux: ReadableStream<Uint8Array>): Promise<string> {
  const lecteur = flux.getReader();
  const morceaux: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await lecteur.read();
      if (done) break;
      if (value !== undefined) {
        total += value.byteLength;
        if (total > PLAFOND_TAILLE_OCTETS) {
          throw erreurReponseTropVolumineuse(null);
        }
        morceaux.push(value);
      }
    }
  } finally {
    await lecteur.cancel().catch(() => undefined);
  }
  return Buffer.concat(morceaux.map((m) => Buffer.from(m))).toString("utf8");
}

/**
 * Transport `fetch` réel (décision 16, 07 §4) : dernière ligne de défense derrière le guard du
 * client, pas un remplacement. Liste blanche d'origines à la construction, `redirect: "manual"` —
 * une redirection n'est **jamais** suivie et aucun en-tête n'est réémis vers la cible —, `GET`
 * métier et `POST` identité seulement (le chemin exact de `/connect/token` reste validé par
 * `src/auth/client-token.ts`), plafond de taille en flux, annulation par `AbortSignal`.
 */
export function creerTransportFetch(params: ParametresTransportFetch): HttpTransport {
  return {
    async request(spec: HttpRequestSpec): Promise<HttpResponseSpec> {
      const origine = origineDe(spec.url);
      if (origine === null || !params.originesAutorisees.includes(origine)) {
        throw erreurHoteNonAutorise(null, origine ?? "url-invalide");
      }
      if (spec.method !== "GET" && spec.method !== "POST") {
        throw erreurMethodeRefusee("transport-fetch", spec.method);
      }

      const reponse = await fetch(spec.url, {
        method: spec.method,
        redirect: "manual",
        ...(spec.headers !== undefined ? { headers: spec.headers } : {}),
        ...(spec.body !== undefined ? { body: spec.body } : {}),
        ...(spec.signal !== undefined ? { signal: spec.signal } : {}),
      });

      const headers: Record<string, string> = {};
      reponse.headers.forEach((valeur, cle) => {
        headers[cle] = valeur;
      });

      // `redirect: "manual"` : la redirection n'est jamais suivie. Undici renvoie un type
      // `opaqueredirect` (statut 0, corps nul) plutôt que le statut 3xx réel ; traité comme une
      // indisponibilité amont par le client (décision 14), jamais comme un succès.
      if (reponse.type === "opaqueredirect" || reponse.body === null) {
        return { status: reponse.status, headers, body: "" };
      }

      const corps = await lireCorpsAvecPlafond(reponse.body);
      return { status: reponse.status, headers, body: corps };
    },
  };
}
