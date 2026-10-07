import { readFile, stat } from "node:fs/promises";
import type { OptionsCli } from "./resolution.js";
import { resoudreConfig } from "./resolution.js";
import type { ConfigResolue } from "./resolution.js";
import { lireVariablesEnv } from "./env.js";
import type { Journal } from "./journal.js";
import { cheminFichierConfig, racineConfig } from "./paths.js";

export interface FichierLu {
  readonly contenu: string;
  /** `null` si le système ne permet pas de lire un mode POSIX (p. ex. Windows). */
  readonly modePosix: number | null;
}

/** Port de lecture (décision 2, 07 §2) : T02 ne lit jamais pour écrire, seulement `config.json`. */
export interface LecteurConfig {
  lire(chemin: string): Promise<FichierLu | null>;
}

export function creerLecteurFs(): LecteurConfig {
  return {
    async lire(chemin: string): Promise<FichierLu | null> {
      try {
        const [contenu, stats] = await Promise.all([readFile(chemin, "utf8"), stat(chemin)]);
        return { contenu, modePosix: stats.mode & 0o777 };
      } catch (erreur) {
        if ((erreur as NodeJS.ErrnoException).code === "ENOENT") {
          return null;
        }
        throw erreur;
      }
    },
  };
}

function contientUnSecret(contenu: string): boolean {
  try {
    const data = JSON.parse(contenu) as { profiles?: Record<string, unknown> };
    return Object.values(data.profiles ?? {}).some(
      (p) => typeof p === "object" && p !== null && ("clientSecret" in p || "subscriptionKey" in p),
    );
  } catch {
    return false;
  }
}

function avertirPermissionsSecret(fichier: FichierLu, journal: Journal): void {
  if (fichier.modePosix === null) return;
  const lisibleParGroupeOuAutres = (fichier.modePosix & 0o077) !== 0;
  if (lisibleParGroupeOuAutres && contientUnSecret(fichier.contenu)) {
    journal.avertir(
      "config.json contient un secret et ses permissions POSIX sont lisibles par le groupe ou par tous.",
    );
  }
}

export interface DependancesChargement {
  readonly lecteur: LecteurConfig;
  readonly env: NodeJS.ProcessEnv;
  readonly home: string;
  readonly cli: OptionsCli;
  readonly journal: Journal;
}

/** IO asynchrone (décision 1, 07 §2) : lit le disque puis délègue tout le calcul à `resoudreConfig`. */
export async function chargerConfig(deps: DependancesChargement): Promise<ConfigResolue> {
  const racine = racineConfig(deps.env, deps.home, deps.journal);
  const chemin = cheminFichierConfig(racine);
  const fichier = await deps.lecteur.lire(chemin);
  if (fichier !== null) {
    avertirPermissionsSecret(fichier, deps.journal);
  }
  const variablesEnv = lireVariablesEnv(deps.env, deps.journal);
  return resoudreConfig({
    contenuFichier: fichier?.contenu ?? null,
    variablesEnv,
    cli: deps.cli,
    racine,
    journal: deps.journal,
  });
}
