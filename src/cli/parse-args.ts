/**
 * Parsing strict avec `node:util.parseArgs` (T13-3, 07 §12, D-T13-1) : API native du runtime Node
 * (`engines.node: ^24.0.0`), pas une dépendance npm — aucun paquet tiers n'est ajouté par ce
 * module. Toute commande/option inconnue ou argument manquant lève {@link ErreurUsageCli} (code
 * de sortie 2, D-T13-2), jamais une erreur Node brute non assainie.
 */
import { parseArgs } from "node:util";
import type { ParseArgsOptionsConfig } from "node:util";
import { ErreurUsageCli } from "./exit-codes.js";

export const COMMANDES = ["serve", "login", "logout", "status", "dossiers"] as const;
export type Commande = (typeof COMMANDES)[number];

export const SOUS_COMMANDES_DOSSIERS = ["list", "add", "remove"] as const;
export type SousCommandeDossiers = (typeof SOUS_COMMANDES_DOSSIERS)[number];

function estCommande(valeur: string): valeur is Commande {
  return (COMMANDES as readonly string[]).includes(valeur);
}

function estSousCommandeDossiers(valeur: string): valeur is SousCommandeDossiers {
  return (SOUS_COMMANDES_DOSSIERS as readonly string[]).includes(valeur);
}

/** Première détection (D-T13-1) : `--help`/`--version` et le nom de commande, sans lever d'erreur sur une option inconnue. */
export interface DetectionPrealable {
  readonly aide: boolean;
  readonly version: boolean;
  readonly commandeTexte: string | undefined;
  readonly positionalsRestants: string[];
}

const OPTIONS_DETECTION: ParseArgsOptionsConfig = {
  help: { type: "boolean", short: "h" },
  version: { type: "boolean" },
};

export function detecterAideEtCommande(argv: readonly string[]): DetectionPrealable {
  const { values, positionals } = parseArgs({
    args: [...argv],
    strict: false,
    allowPositionals: true,
    options: OPTIONS_DETECTION,
  });
  const [commandeTexte, ...reste] = positionals;
  return {
    aide: values["help"] === true,
    version: values["version"] === true,
    commandeTexte,
    positionalsRestants: reste,
  };
}

export interface OptionsParsees {
  readonly commande: Commande;
  readonly sousCommandeDossiers?: SousCommandeDossiers;
  readonly aide: boolean;
  readonly profile?: string;
  readonly env?: "prod" | "preprod";
  readonly mock: boolean;
  readonly noBrowser: boolean;
  readonly json: boolean;
  readonly famille?: string;
  readonly id?: string;
  readonly alias?: string;
  readonly nom?: string;
}

const OPTIONS_COMMUNES: ParseArgsOptionsConfig = {
  profile: { type: "string" },
  env: { type: "string" },
  mock: { type: "boolean" },
  help: { type: "boolean", short: "h" },
  version: { type: "boolean" },
};

const OPTIONS_PAR_COMMANDE: Record<Commande, ParseArgsOptionsConfig> = {
  serve: {},
  login: { "no-browser": { type: "boolean" } },
  logout: {},
  status: { json: { type: "boolean" } },
  dossiers: {
    json: { type: "boolean" },
    famille: { type: "string" },
    id: { type: "string" },
    alias: { type: "string" },
    nom: { type: "string" },
  },
};

function validerEnv(valeur: string | undefined): "prod" | "preprod" | undefined {
  if (valeur === undefined) return undefined;
  if (valeur !== "prod" && valeur !== "preprod") {
    throw new ErreurUsageCli(`Option --env invalide : "${valeur}" (attendu "prod" ou "preprod").`);
  }
  return valeur;
}

/**
 * Analyse complète d'un `argv` (hors `node`/script) pour une commande déjà déterminée (D-T13-1) :
 * lève {@link ErreurUsageCli} sur option inconnue, valeur manquante, ou positionnel inattendu.
 */
export function analyserArgv(argv: readonly string[]): OptionsParsees {
  const detection = detecterAideEtCommande(argv);
  if (detection.commandeTexte !== undefined && !estCommande(detection.commandeTexte)) {
    throw new ErreurUsageCli(`Commande inconnue : "${detection.commandeTexte}".`);
  }
  const commande: Commande = detection.commandeTexte !== undefined ? detection.commandeTexte : "serve";

  const options: ParseArgsOptionsConfig = { ...OPTIONS_COMMUNES, ...OPTIONS_PAR_COMMANDE[commande] };
  let analyse: ReturnType<typeof parseArgs>;
  try {
    analyse = parseArgs({ args: [...argv], strict: true, allowPositionals: true, options });
  } catch (erreur) {
    throw new ErreurUsageCli(`Option invalide : ${erreur instanceof Error ? erreur.message : String(erreur)}`);
  }
  const { values, positionals } = analyse;

  const positionalsRestants = detection.commandeTexte !== undefined ? positionals.slice(1) : positionals;

  let sousCommandeDossiers: SousCommandeDossiers | undefined;
  if (commande === "dossiers") {
    const [sousTexte, ...autres] = positionalsRestants;
    if (sousTexte === undefined) {
      if (!(values["help"] === true)) {
        throw new ErreurUsageCli("Sous-commande `dossiers` manquante (list|add|remove).");
      }
    } else if (!estSousCommandeDossiers(sousTexte)) {
      throw new ErreurUsageCli(`Sous-commande \`dossiers\` inconnue : "${sousTexte}".`);
    } else {
      sousCommandeDossiers = sousTexte;
    }
    if (autres.length > 0) {
      throw new ErreurUsageCli(`Argument positionnel inattendu : "${autres[0]}".`);
    }
  } else if (positionalsRestants.length > 0) {
    throw new ErreurUsageCli(`Argument positionnel inattendu : "${positionalsRestants[0]}".`);
  }

  const env = validerEnv(values["env"] as string | undefined);

  return {
    commande,
    ...(sousCommandeDossiers !== undefined ? { sousCommandeDossiers } : {}),
    aide: values["help"] === true,
    ...(typeof values["profile"] === "string" ? { profile: values["profile"] } : {}),
    ...(env !== undefined ? { env } : {}),
    mock: values["mock"] === true,
    noBrowser: values["no-browser"] === true,
    json: values["json"] === true,
    ...(typeof values["famille"] === "string" ? { famille: values["famille"] } : {}),
    ...(typeof values["id"] === "string" ? { id: values["id"] } : {}),
    ...(typeof values["alias"] === "string" ? { alias: values["alias"] } : {}),
    ...(typeof values["nom"] === "string" ? { nom: values["nom"] } : {}),
  };
}
