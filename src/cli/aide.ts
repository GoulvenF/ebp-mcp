import type { Commande } from "./parse-args.js";

export const AIDE_GLOBALE = `ebp-mcp — serveur MCP communautaire EBP SaaS (lecture seule)

Usage : ebp-mcp [commande] [options]

Commandes :
  serve                 Démarre le serveur MCP sur stdio (par défaut si aucune commande)
  login                 Authentifie ce profil (ouvre le navigateur, ou affiche l'URL avec --no-browser)
  logout                Déconnecte ce profil (supprime les tokens locaux)
  status                Affiche le statut (profil, auth, quota)
  dossiers list|add|remove   Gère les dossiers déclarés dans la configuration

Options communes :
  --profile <p>          Profil de configuration à utiliser
  --env <prod|preprod>    Environnement ciblé
  --mock                  Mode mock (données synthétiques, aucun réseau réel)
  -h, --help              Affiche cette aide (globale, ou pour une commande : ebp-mcp <commande> --help)
  --version               Affiche la version

Codes de sortie : 0 succès, 2 entrée/config invalide, 3 authentification requise, 1 autre erreur.
`;

const AIDE_SERVE = `Usage : ebp-mcp serve [--profile <p>] [--env <prod|preprod>] [--mock]

Démarre le serveur MCP sur stdio. stdout est exclusivement réservé au protocole JSON-RPC ;
tous les journaux vont sur stderr. S'arrête proprement sur SIGINT, SIGTERM ou fin de stdin.
`;

const AIDE_LOGIN = `Usage : ebp-mcp login [--profile <p>] [--env <prod|preprod>] [--mock] [--no-browser]

Authentifie le profil : ouvre le navigateur système sur l'URL d'autorisation (ou l'affiche sur
stderr sans l'ouvrir avec --no-browser). En mode --mock, le consentement est simulé sans jamais
ouvrir de navigateur réel.
`;

const AIDE_LOGOUT = `Usage : ebp-mcp logout [--profile <p>] [--env <prod|preprod>] [--mock]

Déconnecte le profil : supprime les tokens locaux (idempotent).
`;

const AIDE_STATUS = `Usage : ebp-mcp status [--profile <p>] [--env <prod|preprod>] [--mock] [--json]

Affiche le statut local (profil, authentification, quota), sans appel réseau.
`;

const AIDE_DOSSIERS = `Usage :
  ebp-mcp dossiers list [--profile <p>] [--env <prod|preprod>] [--mock] [--json]
  ebp-mcp dossiers add --famille <hubbix-compta|hubbix-gescom> --id <guid> --alias <alias> [--nom <nom>]
  ebp-mcp dossiers remove --alias <alias>

Gère les dossiers déclarés dans la configuration. \`add\` valide le dossier à distance avant de
l'enregistrer ; \`remove\` ne fait aucun appel réseau.
`;

/** Rappel court (D-T13-1) : ajouté sur stderr après `CODE : message` pour une erreur d'usage. */
export const AIDE_COURTE_USAGE = "Consulter `ebp-mcp --help` (ou `ebp-mcp <commande> --help`).\n";

export function aidePourCommande(commande: Commande): string {
  switch (commande) {
    case "serve":
      return AIDE_SERVE;
    case "login":
      return AIDE_LOGIN;
    case "logout":
      return AIDE_LOGOUT;
    case "status":
      return AIDE_STATUS;
    case "dossiers":
      return AIDE_DOSSIERS;
  }
}
