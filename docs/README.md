# Corpus documentaire

## État de validation

**Audit et décisions D01–D08 validés par Goulven le 2026-10-06 (« oui, go »), sans amendement.** Publication GitHub et création du projet Paperclip avec 24 tâches autorisées. L'implémentation n'est pas lancée par cette mise en place.

Le transfert suit la procédure de 08 ; `paperclip-index.md` consignera le projet, les tâches et le SHA effectif du corpus.

## Documents

| Document | Usage |
|---|---|
| [01 — Cadrage](01-cadrage.md) | Vision, cible quatre familles, objectifs |
| [02 — API](02-api-map.md) | Cartographie de la documentation EBP, hypothèses signalées |
| [03 — Auth](03-auth.md) | Contexte OAuth et parcours utilisateur |
| [04 — Sémantique](04-semantic-layer.md) | Catalogue **cible v1**, pas périmètre intégral de v0.1 |
| [05 — Sécurité](05-security.md) | Principes de protection |
| [06 — Audit](06-audit.md) | 26 problèmes, huit décisions validées et limites de vérification |
| [07 — Contrats](07-contrats-v01.md) | Choix précis pour coder : entrées, sorties, erreurs, limites et algorithmes |
| [08 — Backlog](08-backlog.md) | 24 tâches, dépendances, livrables, critères et procédure Paperclip/GitHub |
| [09 — Preuves](09-preuves-et-recette.md) | Questions EBP et gates de recette |

## Précédence

07 définit le comportement précis ; 08 le découpage ; 09 les preuves exigées pour lever les hypothèses. 01–05 donnent le contexte et la cible fonctionnelle. 06 conserve la trace des erreurs et arbitrages. Le catalogue cible n'autorise pas à activer une capacité non documentée ou non prouvée.

Les décisions D01–D08 et les contrats de 07 sont désormais applicables. Les preuves fournisseur et compléments de spécification des tâches ultérieures restent à obtenir. Les corrections factuelles et renvois dans les documents initiaux évitent de reproduire les erreurs identifiées.

## Traçabilité

Chaque tâche référence son Txx, les sections normatives, les Axx/Dxx pertinents et le commit du corpus. Chaque mapping non trivial référence une fixture et sa provenance ; chaque inconnue fournisseur est suivie par un Exx. Une évolution du contrat exige un commit et l'actualisation des tâches dépendantes. Ne jamais publier de preuves contenant des données client ou des identifiants d'accès.
