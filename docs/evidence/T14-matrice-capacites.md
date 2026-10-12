# T14 — Matrice outils/capacités v0.1

SHA recetté : `f19f3dd52bb36c8ac95f1498a07b6bd9fab2c8e5`. Comparaison avec le `tools/list`/`resources/list` réellement renvoyés par `node dist/cli.js serve --mock` (sonde JSON-RPC stdio directe, section 3 du rapport de recette).

**Réalité observée vs attendu** : `tools/list` renvoie exactement **17 outils**, mêmes noms que la liste ci-dessous, sans outil supplémentaire ni manquant. `resources/list` renvoie **7 ressources** (`ebp://dossiers`, `ebp://glossaire`, 4 ressources `demo-cpt/*`, 1 ressource `demo-gc/*`). Les capacités annoncées par le serveur sont `{ "tools": {}, "resources": {} }` (pas de `listChanged`/`subscribe` déclaré).

## Outils × famille × état

| Outil | CPT (hubbix-compta) | GC (hubbix-gescom) | État | Preuve de levée (Exx) |
|---|---|---|---|---|
| `ebp_lister_dossiers` | ✓ | ✓ | validé sur mock / hypothèse live non validée | — (transverse, pas de dépendance Hubbix directe) |
| `ebp_choisir_dossier` | ✓ | ✓ | validé sur mock / hypothèse live non validée | — |
| `ebp_statut` | ✓ | ✓ | validé sur mock / hypothèse live non validée | E01/E02 (auth) pour le détail live des tokens |
| `rechercher_tiers` | ✓ | ✓ | validé sur mock / hypothèse live non validée | E06 (pagination/tri réels), E07 (types `auxiliary-account-types` CPT) |
| `fiche_tiers` | ✓ | ✓ | validé sur mock / hypothèse live non validée | E05 (dossiers/droits), E07 |
| `rechercher_articles` | — (`UNSUPPORTED_CAPABILITY` confirmé en direct) | ✓ | validé sur mock / hypothèse live non validée | E06 (fixtures `gescom-items-*`) |
| `fiche_article` | — | ✓ | validé sur mock / hypothèse live non validée | E06 (fixtures `gescom-items-*`), E05 (dossiers/droits) |
| `lister_documents_vente` | — | ✓ | validé sur mock / hypothèse live non validée | E10 (convention signe avoirs, devise) |
| `detail_document` | — | ✓ | validé sur mock / hypothèse live non validée | E10, E13 (si export lié) |
| `echeancier_clients` | — | ✓ | validé sur mock / hypothèse live non validée | E10 |
| `lister_reglements` | — | ✓ | validé sur mock / hypothèse live non validée | E10 |
| `lister_ecritures` | ✓ | — | validé sur mock / hypothèse live non validée | E06, E07 |
| `detail_ecriture` | ✓ | — | validé sur mock / hypothèse live non validée | E07 |
| `transactions_bancaires` | ✓ | — | validé sur mock / hypothèse live non validée | E07 (statut banque) |
| `balance_comptes` | ✓ | — (`UNSUPPORTED_CAPABILITY` confirmé en direct) | validé sur mock / hypothèse live non validée | E07 (sémantique filtre compte) |
| `grand_livre` | ✓ | — | validé sur mock / hypothèse live non validée | E07 |
| `exercices` | ✓ | — | validé sur mock / hypothèse live non validée | E07 (`compta-domain-information`, `compta-folder-settings`), E06 |

17/17 outils confirmés présents dans `tools/list` réel, avec le même partitionnement CPT/GC que celui déclaré ci-dessus (capacités testées : `tests/services/commun/capacites.test.ts`).

## Ressources × état

| Ressource | État | Preuve de levée |
|---|---|---|
| `ebp://dossiers` | validé sur mock / hypothèse live non validée | — |
| `ebp://glossaire` | validé sur mock / hypothèse live non validée | — |
| `ebp://<dossier-cpt>/exercices` | validé sur mock / hypothèse live non validée | E07 (`compta-domain-information`, `compta-folder-settings`), E06 |
| `ebp://<dossier-cpt>/journaux` | validé sur mock / hypothèse live non validée | E07 |
| `ebp://<dossier-cpt>/plan-comptable` | validé sur mock / hypothèse live non validée | E07 |
| `ebp://<dossier-cpt>/taux-tva` | validé sur mock / hypothèse live non validée | E07 |
| `ebp://<dossier-gc>/taux-tva` | validé sur mock / hypothèse live non validée | E10 |

Toutes les lignes « validé sur mock » signifient : comportement conforme à notre implémentation du contrat 07 sur données synthétiques, **pas** une validation de l'API EBP réelle. Chaque ligne porte aussi « hypothèse live non validée » : aucun outil ni aucune ressource n'est validé face à l'API EBP réelle en v0.1 (section 6 du rapport de recette) ; seul son comportement sur mock (cas nominal et capacité refusée, 06 A03/A04) est couvert.
