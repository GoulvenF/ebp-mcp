# T14 — Recette intégrée v0.1 (mocks)

- **SHA recetté (`main`)** : `f19f3dd52bb36c8ac95f1498a07b6bd9fab2c8e5` (#30, « [T14-3 · v0.1] Recette — scénarios d'acceptation MCP »).
- **CI de ce SHA** : run GitHub Actions `38201932100`, workflow `CI`, succès, 1m01s, déclenché par le push du SHA recetté.
- **Date de recette** : 2026-10-12.
- **Environnement** : Node `v24.21.0`, Ubuntu 24.04.3 LTS (`Linux NUDGER-BETA 6.8.0-85-generic`), exécution dans un worktree git dédié sur l'hôte de build partagé.
- **Portée** : validation sur mocks uniquement. Un succès ici prouve notre implémentation du contrat 07, pas la compatibilité avec l'API EBP réelle (09, « Format de preuve »). Aucune publication npm réalisée ou demandée.

## 1. Gate commune

| Commande | Résultat | Détail |
|---|---|---|
| `npm ci` | ✅ | 135 paquets installés, 0 vulnérabilité. |
| `npm run typecheck` (inclut `npm run build`) | ✅ | `tsc -p tsconfig.build.json` puis `tsc --noEmit` sans erreur. |
| `npm test` | ✅ | **124 fichiers de test, 1090 tests**, tous passés (`vitest run`, 27.56 s). |
| `npm run build` | ✅ | Build TypeScript propre (exécuté en prérequis de typecheck/test, puis revérifié seul). |
| Contrôle réseau (zéro tentative non loopback) | ✅ | `tests/garde/global-setup.ts` (T14-1) installe une garde réseau sur tout le processus vitest et ses enfants ; elle fait échouer `vitest run` (teardown, `process.exitCode = 1`) à la moindre tentative HTTP non loopback. La suite complète est passée sans déclenchement de la garde ⇒ **zéro tentative non loopback** pendant `npm test`. Non-régression propre à T14-1 : `tests/garde/garde-globale.test.ts` (suites imbriquées prouvant que retirer `globalSetup`/`setupFiles` fait échouer la garde). |
| Contrôle tarball (T14-1) | ✅ | `npm run verify:pack` → `verify:pack : 795 fichier(s) examiné(s), aucun refus.` Détail en section 4. |

## 2. Table des scénarios (09 « transverses » marqués T14 + fiche T14)

| Scénario | Test cité (fichier + nom) | Résultat observé |
|---|---|---|
| Deux processus, même identité, token expiré (un seul refresh, génération durable partagée) | `tests/quota/multi-processus.test.ts` — describe `"quota multi-processus (critère 1, 07 §4)"` | ✅ Passé dans `npm test`. |
| Crash après départ refresh (réauthentification explicite, aucun rejeu ancien token) | `tests/auth/crash-refresh.test.ts` — describe `"auth/crash-refresh (scénario 1 de 09 : crash réel pendant refresh)"` | ✅ Passé. |
| Deux profils, même abonnement (départs espacés, compteur unique) | `tests/quota/profils-ab.test.ts` — describe `"quota profils A/B (scénarios 2 et 3 de 09, 07 §4)"` | ✅ Passé. Interprétation « profil A/B » retenue : deux profils de config `a`/`b` du même `quotaGroup`, chacun avec un dossier CPT (`demo-cpt`) et un dossier GC (`demo-gc`) — cf. fixtures du test. |
| Un changement dossier pendant un scan (scan termine sur dossier capturé) | `tests/mcp/acceptance/changement-dossier.test.ts` | ✅ Passé. |
| Page EBP 100 dont peu de matchs (scan continue, total filtré non inventé) | `tests/mcp/acceptance/scan-transverse.test.ts` — describe `"scénario transverse 2 — page EBP peu filtrée, limite coupée en milieu de page, reprise sans perte (07 §5)"` | ✅ Passé. |
| Limite 50 au milieu d'une page (reprise restitue le reste sans perte) | même fichier/describe que ci-dessus, second `tools/call` avec `curseur` | ✅ Passé ; confirmé en direct par sonde `tools/call` manuelle (curseur non nul en sortie de première page, cf. section 3). |
| Budget ou réserve épuisé avant premier résultat (partiel explicite) | `tests/mcp/acceptance/quota-budget-deadline.test.ts` | ✅ Passé. |
| 403 / réponse JSON incompatible (erreur de droits / de schéma, pas approximation) | `tests/mcp/acceptance/erreurs-upstream.test.ts` | ✅ Passé. |
| Texte EBP contenant une instruction ou un secret ressemblant à un header | `tests/mcp/acceptance/texte-piege.test.ts` | ✅ Passé. |
| PII sur tool, ressource, erreur, claims, cache, brut (politique centrale) | `tests/mcp/sortie/politique-pii.test.ts` — describe `"appliquerPolitiqueSortie — D-T12-8"` (8 cas : enveloppe, claims, erreur, avertissements cache, hors-mode, motif non confondu avec donnée) | ✅ Passé. Limite connue conservée telle quelle (section 6) : `it("un libelle EBP qui contient un email n'est pas modifié (limite documentée : seuls les textes du serveur sont masqués)")`. |
| 31e requête empêchée (budget fixe) | `tests/mcp/acceptance/scan-transverse.test.ts` — describe `"scénario transverse 1 — la 31e requête HTTP est empêchée (07 §4)"` ; constante `BUDGET_TENTATIVES_OUTIL = 30` vérifiée par `tests/mcp/execution/constantes.test.ts` | ✅ Passé. |
| Dossier CPT / dossier GC (deux familles couvertes) | `tests/cli/acceptance-cpt-gc.test.ts`, `tests/mock/integration.test.ts` | ✅ Passé — appels CPT et GC confirmés aussi en direct (section 3). |
| PII et stdout (aucune sortie log sur stdout en serve) | `tests/integration/stdio.test.ts` — describe `"stdio (fiche T12, D-T12-14)"`, it `"initialize, tools/list, tools/call, resources/list et read fonctionnent sur un vrai processus enfant ; chaque ligne de stdout est un message JSON-RPC valide, les journaux vont sur stderr..."` | ✅ Passé. |
| Bundle ne contient aucun secret/token/donnée client/config utilisateur | `scripts/verifier-paquet.mjs` (`npm run verify:pack`) + inspection manuelle (section 4) | ✅ Voir section 4. |

Aucun scénario de la liste n'est non couvert.

## 3. Parcours MCP Inspector — documenté et exécuté

- Commande : `CLIENT_PORT=4106 SERVER_PORT=4107 HOST=127.0.0.1 DANGEROUSLY_OMIT_AUTH=true npx @modelcontextprotocol/inspector node dist/cli.js serve --mock`, exécutée en loopback (`127.0.0.1`), ports dans la plage **4100–4109** imposée par l'hôte partagé (4100–4105 déjà occupés par d'autres sessions au moment de la recette ; 4106/4107 libres et utilisés).
- Étapes réalisées, avec capture jointe à l'issue [GOU-382](/GOU/issues/GOU-382) (aucune donnée sensible, jeu synthétique uniquement) :
  1. **Connexion** au serveur `ebp-mcp` via stdio — capture `01-connecte.png`.
  2. **`tools/list`** : 17 outils listés dans le panneau Tools (`rechercher_tiers`, `fiche_tiers`, `rechercher_articles`, `fiche_article`, `lister_documents_vente`, …) — capture `02-tools-list.png`. Confirmé en sonde directe (JSON-RPC stdio hors Inspector) : les 17 noms exacts attendus par 07 §6, sans doublon ni outil supplémentaire.
  3. **Un appel CPT** : `rechercher_tiers` sur `demo-cpt` → résultats synthétiques (`Client Démo Un`/`Deux`, pagination `total: 2`) — capture `03-cpt-rechercher-tiers.png`.
  4. **Une erreur de capacité** : `rechercher_articles` appelé sur `demo-cpt` (famille `hubbix-compta`) → `Tool Error`, `code: "UNSUPPORTED_CAPABILITY"`, message explicite (« n'est pas disponible pour un dossier de la famille `hubbix-compta` ») — capture `04-erreur-capacite.png`. Confirmé symétriquement en sonde directe avec `balance_comptes` sur `demo-gc` (même code d'erreur).
  5. **Un appel GC** : `rechercher_articles` sur `demo-gc` → articles synthétiques (`ART0001`/`ART0002`/`ART0003`) — capture `05-gc-rechercher-articles.png`.
  6. **`resources/list` / `resources/read`** : panneau Resources, 7 URIs (`ebp://dossiers`, `ebp://glossaire`, `ebp://demo-cpt/exercices`, `ebp://demo-cpt/journaux`, `ebp://demo-cpt/plan-comptable`, `ebp://demo-cpt/taux-tva`, `ebp://demo-gc/taux-tva`) ; lecture de `ebp://glossaire` affichée — capture `06-resource-glossaire.png`. Confirmé en sonde directe (`resources/list` et `resources/read` répondent sans erreur).
  7. **Reprise par curseur** : **non capturée manuellement dans l'Inspector** pendant cette session (session Inspector limitée aux 6 étapes ci-dessus). La reprise par curseur est prouvée par le test automatisé `tests/mcp/acceptance/scan-transverse.test.ts` (second `tools/call` avec `curseur: enveloppe1.pagination.curseur!`, reprise exacte des 10 éléments restants sans perte ni doublon) et confirmée en sonde directe hors Inspector (`pagination.curseur` non nul renvoyé après une page coupée). **Défaut de preuve, non bloquant** : à refaire manuellement dans l'Inspector lors d'une prochaine recette si l'exhaustivité stricte du parcours est requise.
- `README.md` « MCP Inspector local » (ligne 86–90) : la commande documentée (`npx @modelcontextprotocol/inspector node dist/cli.js serve --mock`) reste correcte ; elle ne fixe pas de ports. Sur cet hôte partagé, `CLIENT_PORT`/`SERVER_PORT` doivent être fixés dans 4100–4109 — non modifié dans le README car c'est une contrainte de l'hôte de recette, pas du produit.

## 4. `npm pack --dry-run` inspecté

- Tarball : `goulvenf-ebp-mcp-0.0.0.tgz`, **356.6 kB** (paquet), **1.5 MB** (décompressé), **795 fichiers**, intégrité `sha512-f3oJi7iXio9od...h9j+SriIVhbug==`.
- Contenu : uniquement `dist/**` (793 fichiers), `package.json`, `README.md`, `LICENSE` — confirmé par extraction complète du tarball (`tar -tzf`, filtrage hors `dist/`, `package.json`, `README.md`, `LICENSE` → **0 fichier**). Aucun `config.json`, aucune fixture de test, aucun fichier source `.ts` hors `dist/`.
- `npm run verify:pack` : `verify:pack : 795 fichier(s) examiné(s), aucun refus.`
- Vérification manuelle complémentaire (recherche de tokens/e-mails/IDs réels dans le tarball extrait) :
  - Motif e-mail (`[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}`) : seules occurrences trouvées sont les adresses synthétiques du jeu de démo (`client.demo1@example.invalid`, `client.demo2@example.invalid`, `demo@example.invalid`), domaine réservé IANA `.invalid`. Aucune adresse réelle.
  - Motifs de clé/API (`sk-…`, `AKIA…`) : aucune occurrence.
  - Chaîne `config.json` : trouvée uniquement comme littéral de chemin dans `dist/config/paths.js` (référence au nom de fichier que l'utilisateur crée lui-même à l'exécution) — aucun fichier `config.json` réel n'est inclus dans le paquet.
- Sourcemaps : `dist/**/*.js.map` référencent `../src/*.ts` (ex. `dist/cli.js.map` → `"sources":["../src/cli.ts"]`). Les fichiers source eux-mêmes ne sont pas embarqués dans le tarball ; seul le chemin relatif apparaît dans la sourcemap. Décision différée à T24 (09, E15) : accepter cette fuite de chemin relatif ou exclure les sourcemaps du paquet — non tranché ici, non bloquant pour v0.1 (pas de publication npm à ce stade).

## 5. Traçabilité A01–A26 (06)

| Axx | Résolution | Test/code cité |
|---|---|---|
| A01 | Résolu | `src/domain/decimal.ts`, `src/services/commun/capacites.ts`, `src/fixtures/manifeste.ts` ; règles métier 07 §8 implémentées (acomptes bloqués sans rapprochement — A04). |
| A02 | Résolu | `src/domain/decimal.ts` (bibliothèque décimale), montants en chaînes JSON ; `src/fixtures/manifeste.ts` provenance fixtures. |
| A03 | Résolu (capacité désactivée) | `src/adapters/compta/capacites.ts`, `src/services/commun/capacites.ts` ; `tests/services/commun/capacites.test.ts` — échéancier comptable non annoncé comme capacité CPT en v0.1. |
| A04 | Résolu | `src/services/commun/capacites.ts` ; `tests/services/commun/capacites.test.ts` — identifiants qualifiés par famille/dossier, pas de bascule silencieuse. |
| A05 | Résolu | `src/auth/cycle.ts`, `src/auth/store-generations.ts` ; `tests/auth/crash-refresh.test.ts`, `tests/quota/multi-processus.test.ts` — relecture sous lock, génération durable, pas de rejeu. |
| A06 | Résolu | `src/auth/pkce.ts`, `src/auth/callback-loopback.ts`, `src/auth/login.ts` ; `tests/auth/login.test.ts` — PKCE S256 complet, pas de downgrade. URI exacte/preuve préprod restent E01 (09), hors v0.1. |
| A07 | Résolu | `src/quota/*` (groupe de quota persistant, lock interprocessus) ; `tests/quota/multi-processus.test.ts`, `tests/quota/profils-ab.test.ts`. |
| A08 | Résolu structurellement | Aucun des 17 outils n'accepte de paramètre URL libre (confirmé par inspection du schéma réel `tools/list`, section 3) ; chaque route est câblée en dur par adaptateur typé (`src/adapters/hubbix-compta/`, `src/adapters/hubbix-gescom/`). Pas de test dédié « redirection refusée » identifié — limite à noter, non bloquante (pas de tool générique HTTP exposé). |
| A09 | Résolu | `src/mcp/sortie/politique-pii.ts` ; `tests/mcp/sortie/politique-pii.test.ts` — politique centrale sur enveloppe, claims, erreurs, avertissements cache ; `inclure_brut` et exports binaires incompatibles avec le mode masquage (cf. limite documentée section 6). |
| A10 | Résolu | `src/domain/date.ts` ; `tests/domain-date.test.ts` — `+1` jour civil, bornes et date future testées. |
| A11 | Résolu | `src/pagination/scan.ts` ; `tests/mcp/acceptance/scan-transverse.test.ts` — curseur en entrée/sortie, `total`/`total_source` distincts, reprise sans perte. |
| A12 | Résolu | `src/ports/quota-store.ts`, `src/quota/errors.ts` ; `tests/mcp/acceptance/quota-budget-deadline.test.ts` — budget et deadline séparés, partiel explicite. |
| A13 | Résolu | `src/adapters/hubbix-gescom/documents-detail.ts`, `enum-source.ts` ; `tests/cli/acceptance-cpt-gc.test.ts` — référence explicite type/statut pour router un document. |
| A14 | Résolu | `src/adapters/hubbix-gescom/documents.ts`, `reglements.ts`, `schemas-ebp.ts` — enrichissement borné pour documents, filtre ID refusé pour règlements sans preuve d'identité (09 E07/E10). |
| A15 | Différé | Non implémenté en v0.1 (D05) : pas de dashboard/période réinterprétée tant que le modèle réel n'est pas observé. Reporté à T21/T22, preuve E10/E14 de 09. |
| A16 | Différé | Non implémenté en v0.1 (D05) : pas de balance âgée historique. Reporté à T21/T22. |
| A17 | Différé | Hors périmètre v0.1 (familles SaaS). Reporté à T16, preuve E12 de 09. |
| A18 | Différé | Hors périmètre v0.1 (familles SaaS). Reporté à T16/T17, preuve E11 de 09. |
| A19 | Résolu | `src/config/resolution.ts`, `src/config/schema.ts` ; `tests/config/precedence.test.ts` — précédence env/fichier/CLI, familles activées, stores séparés par environnement. |
| A20 | Résolu | `src/pagination/cache.ts` ; clés liées à l'identité/dossier, deux caches mémoire distincts (transactionnel vs référentiel). |
| A21 | Résolu | `src/mcp/sortie/enveloppe.ts` ; `tests/mcp/execution/pipeline.test.ts` — enveloppe MCP, `structuredContent`, `isError`, annotations (`readOnlyHint` etc. confirmés en sonde `tools/list`, section 3). |
| A22 | Reconnu, non levé | Registre de preuves 09 (E01–E15) actif ; aucune fixture ne ferme une question EBP — état assumé par construction, pas une tâche en soi. |
| A23 | Résolu | `docs/10-socle-versions.md` (D09) ; Node 24 de référence, versions verrouillées (`package.json`, `package-lock.json`). |
| A24 | Différé | Revue CGU avant publication reportée à T24 (09, E15 « à vérifier »). Non traité ici (pas de publication npm en v0.1). |
| A25 | Différé | Hors périmètre v0.1 (pas d'export dans les 17 outils). Reporté à T20, preuve E13 de 09. |
| A26 | Résolu | `src/domain/schemas/commun.ts`, `src/domain/schemas/compta.ts` ; `src/fixtures/manifeste.ts` — `id` de ligne ajouté, comptes en chaînes intactes, enum inconnu jamais converti silencieusement (cf. `balance_comptes`/`grand_livre`, section 3). |

Aucun Axx sans ligne.

## 6. Restrictions non validées (v0.1)

- **E01–E15 (09)** : aucune n'est levée par cette recette (mocks uniquement). États inchangés : E01/E02/E03/E04/E05/E08/E09/E10/E11/E14 `inconnu`, E06 `documenté en partie`, E07 `inconnu` (sous-questions wrapper/`types`/sémantique filtre comptable toujours ouvertes), E12 `portée standard non prouvée`, E13 `documenté, non testé`, E15 `à vérifier`.
- **Limite PII connue** : un e-mail (ou IBAN/téléphone) présent dans un libellé EBP n'est **pas** masqué — seuls les textes produits par le serveur (messages d'erreur, avertissements) passent par la politique PII. Preuve : `tests/mcp/sortie/politique-pii.test.ts`, cas « un libelle EBP qui contient un email n'est pas modifié ». Limite documentée, acceptée, non corrigée en v0.1.
- **Absence de validation live** : zéro accès réseau EBP réel pendant toute la recette (gate réseau T14-1 active en continu) ; aucune assertion de compatibilité API n'est faite.
- **A08** : pas de test dédié démontrant le refus explicite d'une redirection HTTP (la garantie vient de l'absence structurelle de tout outil acceptant une URL — voir section 5).
- **Parcours Inspector — reprise par curseur** : non rejouée manuellement dans l'UI Inspector pendant cette session (section 3), seulement prouvée par test automatisé et sonde directe.
- **Sourcemaps** : chemins relatifs vers `src/` visibles dans `dist/**/*.js.map` du tarball ; décision de les exclure ou non différée à T24 (section 4).
- **Pas de publication npm, pas d'assertion « API compatible »** : conforme au périmètre de cette tâche.

## 7. Défauts constatés pendant cette recette

**Aucun défaut bloquant ou non bloquant constaté.** Tous les scénarios de la table de section 2 sont passés sans écart entre attendu et observé. Les deux points notés en section 6 (A08 sans test dédié, reprise par curseur non rejouée manuellement dans l'Inspector) sont des limites de preuve documentées, pas des écarts entre comportement attendu et observé du produit — ils ne sont donc pas qualifiés de défaut.

## Conclusion

Gate commune verte, 14 scénarios transverses/T14 couverts et passés, 17 outils confirmés conformes à 07 §6 par inspection directe du protocole, tarball propre et borné à `dist/**`+`package.json`+`README.md`+`LICENSE`, aucune donnée sensible trouvée. Tous les Axx ont une ligne de résolution ou de report explicite. **T15 est autorisée.**
