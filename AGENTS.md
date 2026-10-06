# Consignes de développement — ebp-mcp

## État et ordre de lecture

Projet au stade documentaire. **Audit et décisions D01–D08 validés par Goulven le 2026-10-06 (« oui, go »).** La publication GitHub du corpus et la création du projet et des 24 tâches Paperclip sont autorisées. Les tâches sont préparées en backlog, non assignées ; l'implémentation commencera lors de leur lancement explicite. Ne pas redemander validation pour les actions déjà autorisées.

Lire dans l'ordre :

1. [Index et décisions](docs/README.md).
2. [Contrats](docs/07-contrats-v01.md), sections concernées par la tâche.
3. [Fiche Txx](docs/08-backlog.md) et ses dépendances.
4. [Cartographie EBP](docs/02-api-map.md), uniquement les endpoints concernés.
5. [Preuves](docs/09-preuves-et-recette.md) avant toute activation live incertaine.

07 prévaut pour les contrats précis ; 01–05 restent vision/cartographie/catalogue cible. Un 🟡 n'est jamais un fait établi. En cas de divergence non résolue, documenter la question et continuer les parties indépendantes ; ne pas inventer de champ, filtre, enum ou route.

## Règles

- Une tâche Txx à la fois ; respecter dépendances et critères d'acceptation. Pas de refonte ou fonctionnalité hors de sa fiche.
- Mock-first, fixtures synthétiques avec provenance. Les tests n'appellent pas EBP ; mode live explicite.
- Toutes les requêtes passent par le client contrôlé ; lecture seule, quota partagé, budget, deadline et annulation. Aucun fetch métier direct dans MCP ou un service.
- Aucun identifiant partagé implicitement entre familles/dossiers ; aucun rapprochement de clients par nom ; pas de données inconnues transformées en zéro.
- Calcul décimal exact, dates civiles, résultats partiels explicites ; aucun total extrapolé ou indicateur non prouvé.
- Secrets et données client hors Git/logs ; stdout réservé au protocole en mode serve ; même politique PII sur tous les canaux de sortie.
- Toute modification de contrat se fait dans les docs et tests avant ou avec le code ; les commentaires Paperclip ne suffisent pas.
- Gate après T01 : `npm ci`, `npm run typecheck`, `npm test`, `npm run build`, plus critères de la fiche. Ne pas prétendre les avoir exécutés quand ils n'existent pas encore.
- Fin de tâche : SHA/PR, modifications, tests réels, limites restantes, mise à jour documentaire. Ne pas publier npm sans autorisation distincte ; GitHub et Paperclip suivent le transfert défini dans 08.
