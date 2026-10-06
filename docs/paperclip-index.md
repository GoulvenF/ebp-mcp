# Index Paperclip — ebp-mcp

Mise en place vérifiée le 2026-10-06, après validation de Goulven.

- [Projet Paperclip](https://yamaka.me/GOU/projects/0c21c844-9ef9-4dd1-8684-7899734525ad) — statut `in_progress`.
- [Objectif v0.1](https://yamaka.me/GOU/goals/66e03261-214b-4cfe-8777-1db066e517e9) — actif, périmètre T01–T14. [Mandat](https://yamaka.me/GOU/approvals/5d1e7a2f-92d7-4853-9c3c-21c3baa267c5) approuvé, enregistré à partir de la validation explicite de Goulven le 2026-10-06.
- [Dépôt GitHub](https://github.com/GoulvenF/ebp-mcp) — public, branche `main`, licence MIT.
- [Corpus validé](https://github.com/GoulvenF/ebp-mcp/tree/b70b71b0792ec1bdc28d86ef0e642899464e85b5) — commit `b70b71b0792ec1bdc28d86ef0e642899464e85b5`.
- Workspace primaire : `38307d5e-670c-49a3-83cf-e63676064229`, source Git `https://github.com/GoulvenF/ebp-mcp`, référence `main`, checkout géré par Paperclip.
- Exécution prévue dans des worktrees isolés. À l'import initial, les 24 tâches étaient non assignées en backlog. T01–T14 ont ensuite été attribuées au Lead Tech à la demande de Goulven ; T15–T24 restent non assignées. T01 a été lancée le 2026-10-06 ; T02–T14 sont en statut `blocked` avec leurs dépendances enregistrées. Les statuts courants se lisent dans Paperclip.

## Correspondance des tâches

Chaque tâche contient la spécification complète, ses critères d'acceptation, les règles communes et des liens immuables vers le corpus. Les dépendances ci-dessous sont aussi enregistrées comme blocages réels dans Paperclip.

| Fiche | Jalon | Tâche Paperclip | ID | Dépend de |
|---|---|---|---|---|
| [T01](08-backlog.md#t01--socle-typescript-et-contrats-partagés) | v0.1 | [GOU-263](https://yamaka.me/GOU/issues/GOU-263) | `f97ce41d-9f1a-4fb2-bb85-bb23ccd95bff` | — |
| [T02](08-backlog.md#t02--configuration-dossiers-et-identité-de-stockage) | v0.1 | [GOU-264](https://yamaka.me/GOU/issues/GOU-264) | `1240b5ff-21fd-44cd-905f-25e3b89e26fb` | [T01 / GOU-263](https://yamaka.me/GOU/issues/GOU-263) |
| [T03](08-backlog.md#t03--décimaux-dates-schémas-et-fixtures) | v0.1 | [GOU-265](https://yamaka.me/GOU/issues/GOU-265) | `29feda05-0352-4d71-987b-129d1c02dbe7` | [T01 / GOU-263](https://yamaka.me/GOU/issues/GOU-263) |
| [T04](08-backlog.md#t04--persistance-atomique-et-locks) | v0.1 | [GOU-266](https://yamaka.me/GOU/issues/GOU-266) | `6bdb16c7-cdc9-4d6c-adf1-4c462d6e4a50` | [T02 / GOU-264](https://yamaka.me/GOU/issues/GOU-264) |
| [T05](08-backlog.md#t05--admission-quota-entre-processus) | v0.1 | [GOU-267](https://yamaka.me/GOU/issues/GOU-267) | `89ac2824-fc0f-4161-9f5a-8cc2aceacb7a` | [T04 / GOU-266](https://yamaka.me/GOU/issues/GOU-266) |
| [T06](08-backlog.md#t06--oauth-et-rotation-concurrente) | v0.1 | [GOU-268](https://yamaka.me/GOU/issues/GOU-268) | `06e631c6-ca02-4a73-b3ec-a0f14023011f` | [T04 / GOU-266](https://yamaka.me/GOU/issues/GOU-266) |
| [T07](08-backlog.md#t07--client-http-contrôlé-et-borné) | v0.1 | [GOU-269](https://yamaka.me/GOU/issues/GOU-269) | `fdcfca2b-147f-46b2-b329-29d3c984325b` | [T05 / GOU-267](https://yamaka.me/GOU/issues/GOU-267), [T06 / GOU-268](https://yamaka.me/GOU/issues/GOU-268) |
| [T08](08-backlog.md#t08--pagination-curseurs-et-cache) | v0.1 | [GOU-270](https://yamaka.me/GOU/issues/GOU-270) | `5a9b2201-fe21-4185-8a84-66008541a05e` | [T03 / GOU-265](https://yamaka.me/GOU/issues/GOU-265), [T07 / GOU-269](https://yamaka.me/GOU/issues/GOU-269) |
| [T09](08-backlog.md#t09--adapter-hubbix-comptabilité) | v0.1 | [GOU-271](https://yamaka.me/GOU/issues/GOU-271) | `2dd399bd-5b83-498d-ac38-1d78ad4dd295` | [T03 / GOU-265](https://yamaka.me/GOU/issues/GOU-265), [T07 / GOU-269](https://yamaka.me/GOU/issues/GOU-269) |
| [T10](08-backlog.md#t10--adapter-hubbix-gestion-commerciale) | v0.1 | [GOU-272](https://yamaka.me/GOU/issues/GOU-272) | `0f5941a6-53af-4965-a89b-0cea254506af` | [T03 / GOU-265](https://yamaka.me/GOU/issues/GOU-265), [T07 / GOU-269](https://yamaka.me/GOU/issues/GOU-269) |
| [T11](08-backlog.md#t11--services-de-lecture-et-calculs-autorisés) | v0.1 | [GOU-273](https://yamaka.me/GOU/issues/GOU-273) | `664d910c-4528-4db7-8d87-6d22dc33321c` | [T08 / GOU-270](https://yamaka.me/GOU/issues/GOU-270), [T09 / GOU-271](https://yamaka.me/GOU/issues/GOU-271), [T10 / GOU-272](https://yamaka.me/GOU/issues/GOU-272) |
| [T12](08-backlog.md#t12--serveur-mcp-ressources-et-politique-de-sortie) | v0.1 | [GOU-274](https://yamaka.me/GOU/issues/GOU-274) | `1002365a-ff74-4e89-87a1-16678d80ab7c` | [T11 / GOU-273](https://yamaka.me/GOU/issues/GOU-273) |
| [T13](08-backlog.md#t13--cli-et-parcours-hors-ligne) | v0.1 | [GOU-275](https://yamaka.me/GOU/issues/GOU-275) | `6b441f14-0259-4e57-957a-099d0c67d3c9` | [T02 / GOU-264](https://yamaka.me/GOU/issues/GOU-264), [T06 / GOU-268](https://yamaka.me/GOU/issues/GOU-268), [T12 / GOU-274](https://yamaka.me/GOU/issues/GOU-274) |
| [T14](08-backlog.md#t14--recette-intégrée-de-la-version-mocks) | v0.1 | [GOU-276](https://yamaka.me/GOU/issues/GOU-276) | `bbd2dbf9-ec58-41c0-a708-436de7b4fb61` | [T13 / GOU-275](https://yamaka.me/GOU/issues/GOU-275) |
| [T15](08-backlog.md#t15--validation-réelle-hubbix-et-oauth) | v0.2 | [GOU-277](https://yamaka.me/GOU/issues/GOU-277) | `3e07eb0e-ae6c-45fb-8aa0-9aeca514792a` | [T14 / GOU-276](https://yamaka.me/GOU/issues/GOU-276) |
| [T16](08-backlog.md#t16--relevé-des-contrats-saas-par-famille) | v0.2 | [GOU-278](https://yamaka.me/GOU/issues/GOU-278) | `6d99f51c-f1e1-4c4f-b998-9869d3e37aea` | [T07 / GOU-269](https://yamaka.me/GOU/issues/GOU-269), [T15 / GOU-277](https://yamaka.me/GOU/issues/GOU-277) |
| [T17](08-backlog.md#t17--lecture-saas-gestion-puis-bâtiment) | v0.2 | [GOU-279](https://yamaka.me/GOU/issues/GOU-279) | `4a7569c4-95a7-48b6-a95b-3984b4d1255f` | [T16 / GOU-278](https://yamaka.me/GOU/issues/GOU-278) |
| [T18](08-backlog.md#t18--contrats-des-outils-experts-et-schéma) | v0.3 | [GOU-280](https://yamaka.me/GOU/issues/GOU-280) | `ef5f1008-6414-4f47-b4ca-a3f1249953f9` | [T16 / GOU-278](https://yamaka.me/GOU/issues/GOU-278) |
| [T19](08-backlog.md#t19--genericquery-et-ressources-de-schéma) | v0.3 | [GOU-281](https://yamaka.me/GOU/issues/GOU-281) | `17e19419-6ba7-4cd0-8569-16db049f793e` | [T17 / GOU-279](https://yamaka.me/GOU/issues/GOU-279), [T18 / GOU-280](https://yamaka.me/GOU/issues/GOU-280) |
| [T20](08-backlog.md#t20--exports-asynchrones-et-reprise) | v0.3 | [GOU-282](https://yamaka.me/GOU/issues/GOU-282) | `4a107268-f132-44b1-bac3-4483dbd00be5` | [T17 / GOU-279](https://yamaka.me/GOU/issues/GOU-279) |
| [T21](08-backlog.md#t21--impayés-balance-âgée-et-indicateurs-courants) | v0.3 | [GOU-283](https://yamaka.me/GOU/issues/GOU-283) | `999941a6-bc53-43e6-9fb5-9fdfc4a3fbc9` | [T15 / GOU-277](https://yamaka.me/GOU/issues/GOU-277), [T17 / GOU-279](https://yamaka.me/GOU/issues/GOU-279) |
| [T22](08-backlog.md#t22--ca-et-transformation-devis-par-période) | v0.3 | [GOU-284](https://yamaka.me/GOU/issues/GOU-284) | `1ad67549-a1a6-4bca-9a20-cd2afc3df5bb` | [T21 / GOU-283](https://yamaka.me/GOU/issues/GOU-283) |
| [T23](08-backlog.md#t23--prompts-et-guides-fren) | v0.3 | [GOU-285](https://yamaka.me/GOU/issues/GOU-285) | `2792b7c8-e1ff-43a7-883e-b49db16a314c` | [T19 / GOU-281](https://yamaka.me/GOU/issues/GOU-281), [T20 / GOU-282](https://yamaka.me/GOU/issues/GOU-282), [T22 / GOU-284](https://yamaka.me/GOU/issues/GOU-284) |
| [T24](08-backlog.md#t24--recette-finale-paquet-et-publication-npm) | v0.3 | [GOU-286](https://yamaka.me/GOU/issues/GOU-286) | `da6fc3d3-2e7d-47c8-b1d4-b86d40c450e0` | [T23 / GOU-285](https://yamaka.me/GOU/issues/GOU-285) |

## Vérifications et maintenance

Import relu depuis Paperclip : 24 tâches uniques, 36 dépendances conformes au backlog et descriptions intégrales. T01–T14 ont été attribuées au Lead Tech et liées à l'objectif v0.1 ; T01 est en cours. Le workspace primaire pointe vers le dépôt et la branche attendus.

La première tâche lancée est [T01 / GOU-263](https://yamaka.me/GOU/issues/GOU-263). Paperclip ne réveille une tâche dépendante qu'une fois **tous** ses bloqueurs terminés et la synchronisation de leurs worktrees confirmée. Une dépendance doit être intégrée sur `main` avant de lancer sa tâche dépendante. La concurrence du Lead Tech est limitée à un run.

Le commit de référence ci-dessus porte les exigences validées. Cet index est publié dans un commit distinct pour éviter toute autoréférence de SHA. Toute évolution des exigences doit modifier le corpus dans Git puis actualiser les descriptions et références des tâches concernées. Les inconnues EBP restent suivies dans [09](09-preuves-et-recette.md).
