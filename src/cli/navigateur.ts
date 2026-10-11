import { spawn } from "node:child_process";

/**
 * Ouvre l'URL d'autorisation dans le navigateur système (T13-3, D-T13-10) : commande par
 * plateforme, détachée (`stdio: "ignore"`, `detached: true`), jamais une dépendance npm. `login()`
 * (`src/auth/login.ts`) attend cette promesse avant de démarrer son serveur de callback : elle
 * résout dès que la commande de lancement a été émise, jamais en attendant la fermeture du
 * navigateur. Un échec de lancement n'est jamais fatal : l'utilisateur garde l'URL (écrite sur
 * stderr par l'appelant) pour l'ouvrir manuellement.
 */
export function creerOuvrirNavigateurSysteme(): (url: string) => Promise<void> {
  return async (url: string): Promise<void> => {
    const [commande, args] = commandePourPlateforme(url);
    try {
      const enfant = spawn(commande, args, { stdio: "ignore", detached: true });
      enfant.on("error", () => {
        // Best effort (D-T13-10) : aucune commande d'ouverture n'est garantie disponible sur tous
        // les systèmes ; l'URL reste affichée sur stderr par l'appelant dans tous les cas.
      });
      enfant.unref();
    } catch {
      // Idem : `spawn` peut lever de façon synchrone sur certaines plateformes.
    }
  };
}

function commandePourPlateforme(url: string): readonly [string, readonly string[]] {
  if (process.platform === "darwin") {
    return ["open", [url]];
  }
  if (process.platform === "win32") {
    // `cmd /c start "" <url>` : le titre vide évite que `start` interprète l'URL comme un titre.
    return ["cmd", ["/c", "start", "", url]];
  }
  return ["xdg-open", [url]];
}

/**
 * Mode `--no-browser` (D-T13-10) : n'ouvre jamais de navigateur, écrit seulement l'URL sur stderr
 * (fait par l'appelant) et résout immédiatement — l'utilisateur ouvre l'URL manuellement.
 */
export function creerOuvrirNavigateurManuel(): (url: string) => Promise<void> {
  return async (): Promise<void> => {
    // Rien à faire : l'URL a déjà été écrite sur stderr par la commande `login` avant cet appel.
  };
}
