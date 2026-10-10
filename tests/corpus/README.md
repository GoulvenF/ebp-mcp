# Corpus de fixtures EBP (`tests/corpus/ebp/`)

Un fichier JSON par fixture, validé par `src/fixtures/manifeste.ts` et chargé par
`src/fixtures/chargeur.ts`. Consommé par `tests/corpus.test.ts` et par les adapters mock
(`src/adapters/hubbix-gescom/` depuis T10a, `src/adapters/compta/` depuis T09) via leurs tests
dédiés (`tests/adapters/*/`).

## Règle de provenance

**Une fixture n'est jamais une preuve live.** Elle documente une hypothèse de contrat — issue de
la documentation officielle `https://developpeurs-storage.ebp.com`, pas d'un appel réel observé.
Le champ `statut` le dit explicitement :

- `synthetique` : cas construit à la main pour couvrir une règle (édition, erreur, limite), sans
  correspondance directe dans la documentation.
- `documente` : forme et champs repris de la documentation officielle (02), non observés sur
  l'API réelle.
- `observe` : nécessite `observe_le` non nul et une ligne de preuve correspondante dans
  [09](../../docs/09-preuves-et-recette.md). **Le corpus v0.1 n'en contient aucune** — toute
  vérification réelle passe par le registre de preuves `Exx`, jamais par une fixture.

Ne jamais présenter le corpus, dans un commentaire, une documentation ou un rapport de recette,
comme une validation de l'API EBP réelle.

## La sortie attendue est calculée à la main

Le champ `attentes` (sortie métier attendue) de chaque fixture est écrit à la main, indépendamment
de tout mapper, **au moment où la fixture est ajoutée au corpus**. Les tests d'adapter
(`tests/adapters/hubbix-gescom/`, `tests/adapters/compta/`) prouvent ensuite qu'un mapper réel
produit exactement cette sortie à partir de `reponse_ebp` ; une fixture dont les `attentes`
changent de contrat (ex. D-T09-1/2 sur `compta-lines-entries`) le documente dans son champ `notes`.

## Ajouter une fixture

1. Choisir un `id` stable en kebab-case, unique dans le corpus.
2. Déterminer la forme réelle de `reponse_ebp.corps` (`data`, `elements`, `linesEntries`,
   `tableau_nu`, `fiche` ou `erreur`) — elle doit être vérifiable par
   `determinerFormeEnveloppeReelle` (`src/fixtures/manifeste.ts`), pas seulement déclarée. `fiche`
   couvre un objet nu sans enveloppe de liste (détail article/client côté GC ; `/domain-information`,
   `/folder-settings`, `/auxiliary-accounts/{number}`, `/general-account/{number}`,
   `/journals/{code}`, `/entries/{uuid}` côté CPT, T09 D-T09-8).
3. Citer la source officielle (`source.url`, `section`, `consulte_le`) et les preuves fournisseur
   assumées (`preuves_liees`, identifiants `Exx` de [09](../../docs/09-preuves-et-recette.md)).
4. Choisir au moins un marqueur de `couverture` parmi l'ensemble fermé défini dans
   `MARQUEURS_COUVERTURE` (`src/fixtures/manifeste.ts`).
5. Écrire `attentes` à la main, conforme à l'enveloppe et aux schémas de domaine du lot 1
   (`src/domain/schemas/`) : décimaux via `isValidDecimalString`, dates via `estDateCivile`.
6. Aucune donnée client réelle, aucun identifiant plausible réutilisable, aucun secret
   (jeton, `Authorization`, `subscription-key`, `client_secret`, IBAN réel, e-mail de domaine
   réel) — y compris dans un corps d'erreur.
7. Lancer `npm test` : `tests/corpus.test.ts` valide le schéma, la forme réelle, les décimaux/dates,
   la provenance, l'absence de secret et la couverture.
