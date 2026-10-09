import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Clock } from "../ports/clock.js";
import { erreurAuthRequise, erreurAuthConfigInvalide } from "./errors.js";

/** En-têtes communs à toute réponse du callback (décision 5, A06/06-audit). */
const ENTETES_PAGE = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
} as const;

function page(titre: string, corps: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${titre}</title></head><body><p>${corps}</p></body></html>`;
}

const PAGE_SUCCES = page("Connexion réussie", "Vous pouvez fermer cette fenêtre et revenir au terminal.");
const PAGE_REFUS = page("Connexion refusée", "L'autorisation a été refusée. Vous pouvez fermer cette fenêtre.");
const PAGE_REQUETE_INVALIDE = page("Requête invalide", "Paramètre manquant ou inconnu.");
const PAGE_INTROUVABLE = page("Introuvable", "Route inconnue.");

export interface ResultatCallback {
  readonly code: string;
  readonly state: string;
}

export interface DependancesCallbackLoopback {
  readonly clock: Clock;
}

/**
 * Démarre un serveur HTTP éphémère exactement sur l'hôte/port/chemin de `redirectUri` (décision 5,
 * A06) et résout au premier callback valide (state connu, non déjà consommé). Jamais `0.0.0.0` :
 * le listener se lie à l'hôte littéral de `redirectUri` (déjà validé loopback en amont).
 *
 * - `state` inconnu/absent ou déjà consommé ⇒ 400, NE CONSOMME PAS le state valide, le serveur
 *   continue d'écouter jusqu'au timeout.
 * - `?error=...` ⇒ erreur explicite assainie (seul le code `error` connu apparaît, jamais
 *   `error_description` brut), state consommé, aucun token.
 * - `EADDRINUSE` ⇒ `CONFIG_INVALID`, jamais de changement silencieux de port.
 * - Fermeture du serveur dans un `finally`, y compris timeout/erreur/annulation.
 */
export async function attendreCallback(
  deps: DependancesCallbackLoopback,
  redirectUri: string,
  state: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<ResultatCallback> {
  const cible = new URL(redirectUri);
  let consomme = false;
  let regle = false;
  let demarre = false;
  let serveur: Server | undefined;

  const controleurMinuteur = new AbortController();

  function fermerServeur(): void {
    if (serveur !== undefined && demarre) {
      serveur.close();
    }
  }

  const promesse = new Promise<ResultatCallback>((resolve, reject) => {
    function regler(action: () => void): void {
      if (regle) return;
      regle = true;
      controleurMinuteur.abort();
      fermerServeur();
      action();
    }

    function traiterRequete(req: IncomingMessage, res: ServerResponse): void {
      const url = new URL(req.url ?? "/", `http://${cible.hostname}:${cible.port}`);
      if (url.pathname !== cible.pathname) {
        res.writeHead(404, ENTETES_PAGE);
        res.end(PAGE_INTROUVABLE);
        return;
      }

      const stateRecu = url.searchParams.get("state");
      if (stateRecu === null || stateRecu !== state || consomme) {
        res.writeHead(400, ENTETES_PAGE);
        res.end(PAGE_REQUETE_INVALIDE);
        return;
      }

      const erreurOAuth = url.searchParams.get("error");
      if (erreurOAuth !== null) {
        consomme = true;
        res.writeHead(200, ENTETES_PAGE);
        res.end(PAGE_REFUS);
        regler(() => {
          reject(
            erreurAuthRequise("Autorisation refusée par EBP.", "Relancer `ebp-mcp login` si nécessaire.", {
              error: erreurOAuth,
            }),
          );
        });
        return;
      }

      const code = url.searchParams.get("code");
      if (code === null || code.length === 0) {
        res.writeHead(400, ENTETES_PAGE);
        res.end(PAGE_REQUETE_INVALIDE);
        return;
      }

      consomme = true;
      res.writeHead(200, ENTETES_PAGE);
      res.end(PAGE_SUCCES);
      regler(() => {
        resolve({ code, state: stateRecu });
      });
    }

    serveur = createServer((req, res) => {
      traiterRequete(req, res);
    });

    serveur.on("error", (erreur: NodeJS.ErrnoException) => {
      regler(() => {
        if (erreur.code === "EADDRINUSE") {
          reject(
            erreurAuthConfigInvalide(
              `Port ${cible.port} déjà utilisé par un autre processus.`,
              "Libérer le port ou corriger redirectUri dans la configuration du profil.",
              { port: cible.port },
            ),
          );
        } else {
          reject(erreur);
        }
      });
    });

    serveur.listen(Number(cible.port), cible.hostname, () => {
      demarre = true;

      const onAbortExterne = (): void => {
        regler(() => {
          reject(erreurAuthRequise("Connexion annulée.", "Relancer `ebp-mcp login` si nécessaire."));
        });
      };
      signal?.addEventListener("abort", onAbortExterne, { once: true });

      deps.clock.wait(timeoutMs, controleurMinuteur.signal).then(() => {
        if (controleurMinuteur.signal.aborted) return;
        signal?.removeEventListener("abort", onAbortExterne);
        regler(() => {
          reject(
            erreurAuthRequise(
              "Aucun callback reçu avant expiration du délai de connexion (5 minutes).",
              "Relancer `ebp-mcp login`.",
            ),
          );
        });
      }, () => undefined);
    });
  });

  return promesse;
}
