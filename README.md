# ebp-mcp

Projet de serveur MCP communautaire pour consulter les données EBP Cloud/SaaS via des outils métier. Non affilié à EBP Informatique.

**État : implémentation v0.1 lancée dans Paperclip ; aucun serveur exécutable ni paquet npm publié dans ce dépôt à cette date.** L'analyse, les contrats et le plan ont été validés le 2026-10-06. Le corpus est publié sur GitHub ; T01 est en cours et T02–T14 attendent leurs dépendances.

- [Corpus documentaire et ordre de lecture](docs/README.md)
- [Audit : risques et décisions proposées](docs/06-audit.md)
- [Cahier des charges précis](docs/07-contrats-v01.md)
- [24 tâches de développement ordonnées](docs/08-backlog.md)
- [Preuves fournisseur et recette](docs/09-preuves-et-recette.md)
- [Instructions aux agents](AGENTS.md)
- [Projet et tâches Paperclip](docs/paperclip-index.md)

Dépôt : [`GoulvenF/ebp-mcp`](https://github.com/GoulvenF/ebp-mcp), licence MIT, paquet `@goulvenf/ebp-mcp`. La publication GitHub du corpus précède le développement ; la publication npm fait l'objet du jalon T24.

Périmètre cible : Hubbix Comptabilité, Hubbix Gestion Commerciale, SaaS Gestion Commerciale et SaaS Bâtiment. Première livraison prévue : socle TypeScript/Node 24, transport stdio, 17 outils Hubbix testés sur mocks. Identifiants EBP fournis par l'utilisateur ; lecture seule. Les données exposées au client MCP peuvent être transmises au fournisseur de modèle qu'il utilise.

## Configuration

`config.json` vit sous `$XDG_CONFIG_HOME/ebp-mcp` (sinon `~/.config/ebp-mcp`). Voir
[`examples/config.demo.json`](examples/config.demo.json) pour un profil avec des dossiers
synthétiques en `prod` et en `preprod`. Secrets (`clientSecret`, `subscriptionKey`) recommandés en
variables d'environnement plutôt qu'en fichier — voir [`.env.example`](.env.example). La précédence
normative (CLI > env > profil > défaut) est décrite dans [07 §2](docs/07-contrats-v01.md) et vérifiée
par la table de tests `tests/config/precedence.test.ts`.

## Développement

Paquet non publié (`"private": true`). Depuis un clone, après `npm ci` :

```sh
npm ci              # installation reproductible depuis package-lock.json
npm run typecheck   # tsc --noEmit sur src/ et tests/
npm test            # vitest run (déclenche le build si nécessaire)
npm run build       # tsc -p tsconfig.build.json → dist/
npm run verify:pack # contrôle du tarball npm (après build)
```

**Tests sans réseau.** `npm test` charge une garde réseau ([`tests/cli/garde-reseau.mjs`](tests/cli/garde-reseau.mjs))
dans chaque worker vitest (`setupFiles`) et, via `NODE_OPTIONS=--import`, dans chaque processus Node
enfant ([`tests/garde/global-setup.ts`](tests/garde/global-setup.ts)). Seul le loopback est permis ;
toute autre émission (`fetch`, `net`, `tls`, `dns`) est bloquée et journalisée, et la suite échoue
en fin d'exécution avec les cibles en cause, même si le test a avalé l'erreur. Preuve :
`tests/garde/garde-globale.test.ts`.

**Contrôle du tarball.** `npm run verify:pack` ([`scripts/verifier-paquet.mjs`](scripts/verifier-paquet.mjs))
lance `npm pack --dry-run --json` et refuse le paquet si un fichier sort de `dist/**`, `package.json`,
`README.md`, `LICENSE`, porte un nom sensible (`.env*`, `config.json`, `tokens.json`,
`generations.json`, `*.pem`, `*.key`, `*.har`, fixtures de corpus, tests) ou contient un motif de
secret (`Authorization: Bearer` avec valeur, JWT, clé privée PEM, `refresh_token`/`access_token`
littéral, e-mail hors domaines d'exemple). Les refus citent fichier, ligne et règle, jamais la
valeur. Les vrais positifs légitimes sont listés et justifiés dans `EXCEPTIONS`. La CI l'exécute
après le build.

## Binaire `ebp-mcp`

Non publié ni installé globalement : après `npm run build`, le binaire est `dist/cli.js`
(exécutable, shebang Node). Toujours l'invoquer explicitement avec `node` dans ce dépôt :

```sh
node dist/cli.js <commande> [options]
```

**Commandes** : `serve` (défaut), `login [--no-browser]`, `logout`, `status [--json]`,
`dossiers list [--json]`, `dossiers add --famille <hubbix-compta|hubbix-gescom> --id <guid>
--alias <alias> [--nom <nom>]`, `dossiers remove --alias <alias>`.

**Options communes** : `--profile <p>`, `--env <prod|preprod>`, `--mock` (données synthétiques,
aucun réseau réel). `--help`/`-h` et `--version` existent au niveau global et par commande.

**Codes de sortie** : `0` succès ; `2` entrée/config invalide ou usage (commande/option inconnue) ;
`3` authentification requise ; `1` toute autre erreur.

### Démonstration hors ligne (`--mock`)

```sh
node dist/cli.js login --mock    # écrit des tokens simulés sous <racine>/mock/
node dist/cli.js serve --mock    # serveur MCP sur stdio, données synthétiques
```

Aucune émission réseau réelle en mode mock (transport simulé, identité OAuth simulée). Les
réponses portent `meta.mode: "mock"` ; les données exposées sont synthétiques (jeu de démo
`src/mock/donnees/`), jamais des données EBP réelles.

### MCP Inspector local

```sh
npx @modelcontextprotocol/inspector node dist/cli.js serve --mock
```
