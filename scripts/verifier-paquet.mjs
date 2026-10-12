#!/usr/bin/env node
// Contrôle du tarball npm (T14-1, livrable « bundle sans secret, token, donnée client ni fichier
// de config utilisateur »). Exécute `npm pack --dry-run --json` dans la racine du paquet (le
// répertoire courant, ou `--racine <dir>`), relit chaque fichier listé et refuse le paquet si :
// - un fichier sort de la liste blanche `dist/**`, `package.json`, `README.md`, `LICENSE` ;
// - un fichier porte un nom sensible (env, config ou tokens utilisateur, clé, capture HAR,
//   fixture de corpus, test) ;
// - un contenu correspond à un motif de secret, hors exceptions explicites ci-dessous ;
// - une cible `bin` du package.json manque (paquet construit sans `dist/`).
// Les refus citent fichier, ligne et règle, jamais la valeur détectée : le journal de CI ne doit
// pas recopier le secret qu'il signale. Code de sortie 0 si aucun refus, 1 sinon, 2 si npm échoue.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const RACINES_AUTORISEES = new Set(["package.json", "README.md", "LICENSE"]);

/** Règles sur le chemin : chacune renvoie vrai si le fichier est interdit. */
const REGLES_NOM = [
  { regle: "fichier d'environnement (.env*)", interdit: (c) => basename(c).startsWith(".env") },
  {
    regle: "configuration ou tokens utilisateur",
    interdit: (c) => ["config.json", "tokens.json", "generations.json"].includes(basename(c)),
  },
  { regle: "clé ou certificat (*.pem, *.key)", interdit: (c) => /\.(pem|key)$/i.test(c) },
  { regle: "capture HTTP (*.har)", interdit: (c) => /\.har$/i.test(c) },
  {
    // `dist/fixtures/*.js` est le chargeur de fixtures compilé (code, pas donnée) : seules les
    // données (`.json`), les fichiers `*.fixture.*` et tout ce qui vit sous `corpus/` sont refusés.
    regle: "fixture de corpus",
    interdit: (c) => /(^|\/)corpus\//.test(c) || /\.fixture\./.test(c) || /(^|\/)fixtures\/.*\.json$/i.test(c),
  },
  {
    regle: "fichier de test",
    interdit: (c) => /(^|\/)(tests?|__tests__)\//.test(c) || /\.(test|spec)\.[cm]?[jt]sx?(\.map)?$/.test(c),
  },
];

/** Domaines réservés aux exemples (RFC 2606/6761) : seules adresses e-mail admises dans le paquet. */
function estDomaineExemple(domaine) {
  const d = domaine.toLowerCase();
  return /(^|\.)example\.(com|org|net)$/.test(d) || /\.(test|invalid)$/.test(d);
}

/** Motifs de secret : chacun produit, pour une ligne, les extraits suspects. */
const REGLES_CONTENU = [
  {
    regle: "en-tête Authorization: Bearer avec valeur",
    trouver: (ligne) => [...ligne.matchAll(/Authorization["']?\s*[:=]\s*["'`]?Bearer\s+[^\s"'`]+/gi)].map((m) => m[0]),
  },
  {
    regle: "JWT",
    trouver: (ligne) => [...ligne.matchAll(/\beyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{10,}/g)].map((m) => m[0]),
  },
  {
    regle: "clé privée PEM",
    trouver: (ligne) => [...ligne.matchAll(/-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----/g)].map((m) => m[0]),
  },
  {
    // Valeur littérale : chaîne entre guillemets après `:`/`=` (JSON, objet JS) ou valeur
    // form-urlencoded. Un nom de champ seul, une valeur vide ou un gabarit `${…}` ne sont pas visés.
    regle: "refresh_token/access_token avec valeur littérale",
    trouver: (ligne) => [
      ...[...ligne.matchAll(/\b(?:refresh|access)_token["']?\s*[:=]\s*["'`](?!\$\{)[^"'`\s]+/g)].map((m) => m[0]),
      ...[...ligne.matchAll(/\b(?:refresh|access)_token=[\w.~+/-]{8,}/g)].map((m) => m[0]),
    ],
  },
  {
    regle: "adresse e-mail hors domaine d'exemple",
    trouver: (ligne) =>
      [...ligne.matchAll(/[\w.%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})/g)]
        .filter((m) => !estDomaineExemple(m[1]))
        .map((m) => m[0]),
  },
];

/**
 * Vrais positifs légitimes du code, admis par fichier et extrait exacts. Toute nouvelle entrée
 * doit dire pourquoi l'extrait n'est pas un secret.
 */
const EXCEPTIONS = [
  {
    fichier: "dist/http/entetes.js",
    extrait: "Authorization: `Bearer ${params.accessToken}",
    raison: "construction de l'en-tête depuis le token en mémoire ; gabarit, aucune valeur littérale",
  },
];

function estException(fichier, extrait) {
  return EXCEPTIONS.some((e) => e.fichier === fichier && e.extrait === extrait);
}

/**
 * Analyse une liste `{ chemin, contenu }` et renvoie les refus, triés. `bins` liste les cibles
 * `bin` attendues dans le paquet.
 */
function analyserPaquet(fichiers, bins = []) {
  const refus = [];
  const chemins = new Set(fichiers.map((f) => f.chemin));
  for (const bin of bins) {
    if (!chemins.has(bin)) refus.push(`${bin} : cible bin absente du paquet`);
  }
  for (const { chemin, contenu } of fichiers) {
    if (!RACINES_AUTORISEES.has(chemin) && !chemin.startsWith("dist/")) {
      refus.push(`${chemin} : hors liste blanche (dist/**, package.json, README.md, LICENSE)`);
    }
    for (const { regle, interdit } of REGLES_NOM) {
      if (interdit(chemin)) refus.push(`${chemin} : ${regle}`);
    }
    contenu.split("\n").forEach((ligne, index) => {
      for (const { regle, trouver } of REGLES_CONTENU) {
        if (trouver(ligne).some((extrait) => !estException(chemin, extrait))) {
          refus.push(`${chemin}:${index + 1} : ${regle}`);
        }
      }
    });
  }
  return refus.sort();
}

function listerPaquet(racine) {
  const npm = process.env.npm_execpath;
  const [commande, prefixe] = npm !== undefined && npm.endsWith(".js") ? [process.execPath, [npm]] : ["npm", []];
  const resultat = spawnSync(commande, [...prefixe, "pack", "--dry-run", "--json", "--ignore-scripts"], {
    cwd: racine,
    encoding: "utf8",
    env: { ...process.env, npm_config_update_notifier: "false", npm_config_fund: "false" },
  });
  if (resultat.status !== 0) {
    throw new Error(`npm pack --dry-run a échoué (code ${resultat.status}) :\n${resultat.stderr}`);
  }
  const [paquet] = JSON.parse(resultat.stdout);
  return paquet.files.map((f) => f.path);
}

function cheminsBin(racine) {
  const { bin } = JSON.parse(readFileSync(join(racine, "package.json"), "utf8"));
  const cibles = typeof bin === "string" ? [bin] : Object.values(bin ?? {});
  return cibles.map((c) => c.replace(/^\.\//, ""));
}

function principal(argv) {
  const index = argv.indexOf("--racine");
  const racine = resolve(index >= 0 ? argv[index + 1] : ".");
  let chemins;
  try {
    chemins = listerPaquet(racine);
  } catch (erreur) {
    process.stderr.write(`verify:pack : ${erreur.message}\n`);
    return 2;
  }
  const fichiers = chemins.map((chemin) => ({ chemin, contenu: readFileSync(join(racine, chemin), "utf8") }));
  const refus = analyserPaquet(fichiers, cheminsBin(racine));
  for (const ligne of refus) process.stdout.write(`REFUS ${ligne}\n`);
  const bilan = refus.length === 0 ? "aucun refus" : `${refus.length} refus`;
  process.stdout.write(`verify:pack : ${fichiers.length} fichier(s) examiné(s), ${bilan}.\n`);
  return refus.length === 0 ? 0 : 1;
}

process.exitCode = principal(process.argv.slice(2));
