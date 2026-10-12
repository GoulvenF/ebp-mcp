#!/usr/bin/env node
import { homedir } from "node:os";
import { executerCli } from "./cli/executer.js";
import { codeSortiePourErreur, ligneErreurCli } from "./cli/exit-codes.js";
import type { DepsCli } from "./cli/types.js";

/**
 * Seul endroit du binaire qui touche `process.*` (D-T13-1) : `src/cli/` ne reçoit que `DepsCli`.
 * SIGTERM, SIGINT et la fin de stdin abandonnent le même `AbortSignal` (D-T13-12) — `serve` s'en
 * sert pour s'arrêter proprement, `login` pour sortir en code 1 sans écrire de token ; les autres
 * commandes l'ignorent. Un seul listener `"end"` sur `stdin` : il ne force jamais le flux en mode
 * flowing (contrairement à un listener `"data"`), donc aucune commande qui n'attend pas de signal
 * ne reste bloquée à cause de lui.
 */
const controleur = new AbortController();
function demanderArret(): void {
  controleur.abort();
}
process.on("SIGTERM", demanderArret);
process.on("SIGINT", demanderArret);
process.stdin.on("end", demanderArret);

const deps: DepsCli = {
  env: process.env,
  home: homedir(),
  stdin: process.stdin,
  stdout: process.stdout,
  stderr: process.stderr,
  signal: controleur.signal,
  forcerSortie: (code: number) => process.exit(code),
};

executerCli(process.argv.slice(2), deps).then(
  (code) => {
    process.exitCode = code;
  },
  (erreur: unknown) => {
    process.stderr.write(`${ligneErreurCli(erreur)}\n`);
    process.exitCode = codeSortiePourErreur(erreur);
  },
);
