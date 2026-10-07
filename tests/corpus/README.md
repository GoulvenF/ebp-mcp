# Corpus de fixtures EBP (`tests/corpus/ebp/`)

Un fichier JSON par fixture, validé par `src/fixtures/manifeste.ts` et chargé par
`src/fixtures/chargeur.ts`. Consommé par `tests/corpus.test.ts` et, plus tard, par les adapters
mock de T09/T10.

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
de tout mapper. Aucun mapper n'est exécuté pour produire ces valeurs — T09/T10 devront, plus tard,
prouver qu'un mapper réel produit exactement cette sortie à partir de `reponse_ebp`.

## Ajouter une fixture

1. Choisir un `id` stable en kebab-case, unique dans le corpus.
2. Déterminer la forme réelle de `reponse_ebp.corps` (`data`, `elements`, `linesEntries`,
   `tableau_nu` ou `erreur`) — elle doit être vérifiable par
   `determinerFormeEnveloppeReelle` (`src/fixtures/manifeste.ts`), pas seulement déclarée.
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
