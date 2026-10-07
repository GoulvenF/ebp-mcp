import { isAbsolute, join } from "node:path";
import type { Journal } from "./journal.js";

/**
 * Racine de configuration (07 §2) : `$XDG_CONFIG_HOME/ebp-mcp` si `XDG_CONFIG_HOME` est un chemin
 * absolu, sinon `<home>/.config/ebp-mcp`. Une valeur relative est ignorée avec avertissement
 * (spec XDG : une valeur non absolue doit être ignorée par l'application).
 */
export function racineConfig(env: NodeJS.ProcessEnv, home: string, journal?: Journal): string {
  const xdg = env.XDG_CONFIG_HOME;
  if (xdg !== undefined && xdg !== "") {
    if (isAbsolute(xdg)) {
      return join(xdg, "ebp-mcp");
    }
    journal?.avertir(`XDG_CONFIG_HOME ignoré car non absolu : ${xdg}`);
  }
  return join(home, ".config", "ebp-mcp");
}

export function cheminFichierConfig(racine: string): string {
  return join(racine, "config.json");
}
