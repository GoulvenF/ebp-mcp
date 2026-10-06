# 08 — Backlog de développement et transfert Paperclip

**Backlog validé par Goulven le 2026-10-06.** Création des tâches Paperclip autorisée ; aucun lancement d'agent implicite. Les IDs T01–T24 sont stables ; ils seront conservés dans les titres Paperclip. Chaque section est une fiche de tâche à copier intégralement avec les règles communes ci-dessous. Les contrats futurs sont des tâches de spécification avant implémentation, pas une invitation à deviner les données EBP.

## Règles communes à toutes les tâches

- Lire [AGENTS.md](../AGENTS.md), la section référencée de [07](07-contrats-v01.md), puis la cartographie utile de [02](02-api-map.md). La documentation validée dans Git reste la source de vérité.
- Une tâche produit une PR ou un commit identifiable, des tests de comportement concernés et une note de validation. Aucun changement des formules, signatures ou limites sans modification explicite du contrat et revue.
- Ne pas introduire de TODO qui simule un succès, de fixture copiée du mapper testé, d'appel réseau réel en test par défaut, ni de secret. Une fixture contient requête attendue, réponse EBP distincte et sortie métier attendue calculée indépendamment.
- Gate commune dès T01 : `npm ci`, `npm run typecheck`, `npm test`, `npm run build`. Ces commandes sont **à créer en T01**, elles n'existent pas aujourd'hui. Ajouter la vérification ciblée de chaque fiche ; ne pas remplacer les tests par une simple compilation.
- Une dépendance est satisfaite quand son livrable est intégré sur la branche de base, pas seulement quand un agent a fini son brouillon. Pas de travail concurrent dans un checkout partagé.
- Une question fournisseur non résolue devient une preuve demandée dans [09](09-preuves-et-recette.md). Le développement des capacités prouvées continue ; le mapping incertain reste désactivé.
- Fin de tâche : fournir fichiers changés, tests exécutés/résultats, références Axx/Dxx traitées, SHA et lien PR. Les gates T14/T17/T24 exigent une revue distincte de l'implémentation.

## Ordre et dépendances

Les numéros donnent un ordre topologique recommandé. `—` = départ après validation de l'analyse et mise en place GitHub/Paperclip. Priorité élevée ne supprime pas les dépendances.

| ID | Livraison | Titre | Dépend de | Priorité | Nature |
|---|---|---|---|---|---|
| T01 | v0.1 | Socle TypeScript et contrats partagés | — | haute | développement |
| T02 | v0.1 | Configuration, dossiers, identité de stockage | T01 | haute | développement |
| T03 | v0.1 | Décimaux, dates, schémas et corpus de fixtures | T01 | haute | développement |
| T04 | v0.1 | Persistance atomique et locks | T02 | haute | développement sensible |
| T05 | v0.1 | Admission quota entre processus | T04 | haute | développement sensible |
| T06 | v0.1 | OAuth et rotation concurrente | T04 | haute | développement sensible |
| T07 | v0.1 | Client HTTP contrôlé et borné | T05, T06 | haute | développement |
| T08 | v0.1 | Pagination, curseurs et cache | T03, T07 | haute | développement |
| T09 | v0.1 | Adapter Hubbix Comptabilité | T03, T07 | haute | développement |
| T10 | v0.1 | Adapter Hubbix Gestion Commerciale | T03, T07 | haute | développement |
| T11 | v0.1 | Services de lecture et calculs autorisés | T08, T09, T10 | haute | développement |
| T12 | v0.1 | Serveur MCP, ressources et politique de sortie | T11 | haute | développement |
| T13 | v0.1 | CLI et parcours hors ligne | T02, T06, T12 | normale | développement |
| T14 | v0.1 | Recette intégrée de la version mocks | T13 | haute | gate |
| T15 | v0.2 | Validation réelle Hubbix et OAuth | T14 | haute | preuve fournisseur |
| T16 | v0.2 | Relevé des contrats SaaS par famille | T07, T15 | haute | preuve fournisseur |
| T17 | v0.2 | Lecture SaaS Gestion puis Bâtiment | T16 | haute | développement + gate |
| T18 | v0.3 | Contrats des outils experts et schéma | T16 | normale | spécification |
| T19 | v0.3 | GenericQuery et ressources de schéma | T17, T18 | normale | développement |
| T20 | v0.3 | Exports asynchrones et reprise | T17 | normale | spécification + développement |
| T21 | v0.3 | Impayés, balance âgée et indicateurs courants | T15, T17 | normale | métier |
| T22 | v0.3 | CA et transformation devis par période | T21 | normale | métier |
| T23 | v0.3 | Prompts et guides FR/EN | T19, T20, T22 | normale | intégration |
| T24 | v0.3 | Recette finale, paquet et publication npm | T23 | haute | gate + publication |

T04–T08 demandent une revue attentive même si le code est confié à un agent simple. T15/T16 exigent un accès EBP et un opérateur ; leurs preuves ne peuvent pas être fabriquées par un agent. T18/T20/T21/T22 doivent figer leurs compléments de contrat avant leurs sous-lots de code.

## T01 — Socle TypeScript et contrats partagés

**But :** un projet installable et des interfaces uniques pour les lots suivants. **Dépendances :** aucune. **Références :** 07 §1/5/7, D02, A21/A23.

**Livrables :** package npm privé pendant développement, engines Node 24, ESM, tsconfig strict, Vitest, scripts de gate, lockfile, CI Node 24 ; `.gitignore`, `.env.example` sans secret ; interfaces des ports et types d'enveloppe/erreurs/capacités ; décision écrite versions SDK/Zod et bibliothèque décimale. Préserver le corpus existant. README indique version non publiée.

**Acceptation :** installation propre et gate commune passent ; erreur de type volontaire détectée par typecheck ; test qui importe le code compilé ; aucun script prepublish ne publie automatiquement. **Hors périmètre :** auth, adapters, publication. **Passage :** T02 et T03 utilisent ces types sans les dupliquer.

## T02 — Configuration, dossiers et identité de stockage

**But :** rendre chaque contexte déterministe. **Dépendance :** T01. **Références :** 07 §2, A19/A04.

**Livrables :** schéma config versionné, résolution CLI/env/fichier, validation des alias et familles, normalisation dossiers, groupes de quota, clés par famille, identité de store profil/env/client, configuration de démonstration avec deux dossiers synthétiques.

**Acceptation :** table de tests de précédence ; prod et préprod n'échangent ni tokens ni dossiers ; alias invalide/traversal refusé ; env vide rejeté ; famille non activée non interrogée ; contexte d'une requête ne change pas si la session change de dossier pendant son exécution. **Hors périmètre :** découverte SaaS et trousseau.

## T03 — Décimaux, dates, schémas et fixtures

**But :** empêcher les agents de choisir leurs propres formats. **Dépendance :** T01. **Références :** 07 §5/8, A01/A02/A10/A26.

**Livrables :** primitives décimales/dates/identifiants ; schémas domaine pour les objets v0.1 ; manifestes de fixtures avec URL/section officielle, date, statut synthétique/documenté/observé et attentes. Couvrir enveloppes `data`, `elements`, `linesEntries`, tableau nu, erreurs, page vide, null et enum inconnu. Les familles SaaS restent hors des mappers exécutables.

**Acceptation :** `0.10 + 0.20 = "0.30"`, lexème au-delà de la précision Number conservé, prix unitaire précis, avoir déjà négatif non réinversé, 29 février valide/invalide, intervalle d'un jour, passage heure d'été, compte avec zéros conservé ; donnée inconnue ≠ zéro. **Hors périmètre :** fixture présentée comme preuve live et implémentation CA.

## T04 — Persistance atomique et locks

**But :** supporter plusieurs processus locaux et les crashes. **Dépendance :** T02. **Références :** 07 §3/4, A05/A07.

**Livrables :** store JSON atomique versionné, locks réutilisables pour auth/config/quota, permissions, récupération après mort du propriétaire, erreurs sûres. Injection des opérations FS critiques pour simuler leurs échecs.

**Acceptation :** deux processus ne modifient pas simultanément un même état ; lecteur ne voit jamais un demi-JSON ; crash avant/après rename, disque plein et permission refusée testés ; aucun lock d'un processus vivant volé par expiration ; fichiers temporaires sans données accessibles à d'autres utilisateurs sur POSIX. **Hors périmètre :** NFS, coffre OS, réseau EBP.

## T05 — Admission quota entre processus

**But :** une politique d'admission unique pour tous les consommateurs d'un abonnement. **Dépendance :** T04. **Références :** 07 §4, D07, A07/A12.

**Livrables :** compteur persistant par groupe, espacement réel des départs, réserve, cooldown 429 partagé, métadonnées estimatives ; horloge injectable.

**Acceptation :** deux processus/profils dans le même groupe n'émettent pas à moins de 1000 ms ; groupes distincts indépendants ; aucun burst après réveil tardif ; réserve 500 sur plafond 10000 refuse la tentative suivante après 9500 réservations ; rollover Paris et changement DST, horloge reculante, crash après réservation, Retry-After supérieur à deadline testés. **Hors périmètre :** garantir le quota d'autres machines/applications.

## T06 — OAuth et rotation concurrente

**But :** login/refresh/logout cohérents, sans rejouer un secret à usage unique. **Dépendance :** T04. **Références :** 03 et 07 §3, A05/A06.

**Livrables :** serveur callback loopback, client token distinct, PKCE complet, store de générations, marqueur refresh, diagnostic auth local. Transport identité mocké injectable, demande de budget incluse.

**Acceptation :** mauvais state, callback rejoué, erreur OAuth, port occupé, timeout, absence refresh token, `expires_in` invalide ; deux processus provoquent un seul refresh ; réponse perdue ou crash après marqueur interdit rejeu ; nouvelle paire persistée avant tout usage ; logout pendant login empêche de ressusciter des tokens ; jamais de fallback PKCE automatique. **Hors périmètre :** prouver la compatibilité EBP réelle (T15).

## T07 — Client HTTP contrôlé et borné

**But :** tous les accès distants respectent auth, quota et lecture seule. **Dépendances :** T05/T06. **Références :** 07 §4, 05, A08/A12.

**Livrables :** registre méthode/route/hôte, encodage des segments et paramètres, hooks token/admission, retry borné, annulation, normalisation d'erreurs, taille maximale, log sans contenu sensible.

**Acceptation :** POST métier/maintenance, host étranger et redirection refusés avant fuite de headers ; 401 une fois puis reprise avec génération récente ; 403 sans refresh ; 429 respecte Retry-After ; maximum trois tentatives GET ; limite 30/deadline/15 s requête ; corps malformé ou 5 Mio dépassés ; annulation en attente n'émet rien. Capturer logs et vérifier absence de secrets injectés dans headers, body et erreurs. **Hors périmètre :** exports et routes arbitraires.

## T08 — Pagination, curseurs et cache

**But :** mutualiser les scans bornés. **Dépendances :** T03/T07. **Références :** 07 §5, A11/A20.

**Livrables :** page source abstraite, moteur scan/filtrage/enrichissement, curseurs mémoire, cache avec identités et générations, arrêt partiel explicite.

**Acceptation :** page de 100 filtrée vers 3 résultats ; limite atteinte à mi-page puis reprise sans perte ; page sans match suivie d'une page avec match ; budget épuisé avec 0 résultat ; total source ≠ total filtré ; page répétée ; curseur expiré/autre dossier/autre filtre/double consommation ; invalidation auth ; capacités mémoire et taille sortie respectées. **Hors périmètre :** pagination métier dupliquée dans les outils.

## T09 — Adapter Hubbix Comptabilité

**But :** lire et normaliser une page/fiche à la fois. **Dépendances :** T03/T07. **Références :** 02 §2, 07 §5/6, A03/A26.

**Livrables :** routes `domain-information`, `folder-settings`, `auxiliary-account-types`, `auxiliary-accounts`, `general-account`, `journals`, `lines-entries`, `entries/{uuid}`, `bank-transactions`, `vat-rate` ; schémas spécifiques à chaque wrapper ; header `tenantid`.

**Acceptation :** fixtures indépendantes pour chaque route utilisée ; `linesEntries` ne se lit pas comme `data` ; UUID ligne distinct de UUID écriture ; debit/credit null selon route correctement représentés ; compte opaque conservé ; valeur inconnue signalée ; pas de catégorie/tri/préfixe non prouvé envoyé. **Hors périmètre :** échéancier CPT, CA CPT, écritures réseau.

## T10 — Adapter Hubbix Gestion Commerciale

**But :** normaliser catalogues, documents, échéances et règlements. **Dépendances :** T03/T07. **Références :** 02 §3, 07 §5/6, A13/A14.

**Livrables :** routes des outils v0.1 + TVA, schémas wrappers et enums, header `DomainId`, table exhaustive de routage par type/statut ; détail articles bien/service.

**Acceptation :** facture/avoir provisoire et validé, devis provisoire/facturé, acomptes, enum inattendu ; ID client absent des listes reste null ; normalisation décimale, `remainingAmount` des échéances et documents correctement distingués ; pas de `GET /customers` inventé ; 404 ne déclenche pas une autre route de détail. **Hors périmètre :** dashboards interprétés, recherche clients reconstituée, écriture.

## T11 — Services de lecture et calculs autorisés

**But :** réaliser les 14 outils métier de 07 (les trois outils contexte arrivent en T12). **Dépendances :** T08/T09/T10. **Références :** 07 §6/8, A01–A04/A13/A14.

**Livrables :** un service par intention ou petit groupe cohérent, manifeste des capacités, résolution code/numéro, filtre local et coût des enrichissements, balance de mouvements, retard d'échéance. Découpage interne recommandé : lectures CPT, lectures GC, puis agrégat balance.

**Acceptation :** toutes signatures de 07 testées ; résolution ambiguë et scan incomplet distincts de 404 ; filtre client document utilise un ID prouvé ; tiers non supporté dans règlements refusé avant réseau ; équilibre/solde sur données partielles jamais déclaré exhaustif ; jour d'échéance non en retard ; aucun CA/acompte ou rapprochement inter-dossiers ajouté. **Hors périmètre :** transport MCP.

## T12 — Serveur MCP, ressources et politique de sortie

**But :** exposer les services sans logique métier dupliquée. **Dépendance :** T11. **Références :** 07 §6/7, A09/A21.

**Livrables :** 17 outils enregistrés, schémas stricts d'entrée/sortie, outils contexte, ressources v0.1, serializer unique et politique PII ; descriptions FR/EN et annotations ; injection mock/live explicite.

**Acceptation :** client SDK réel avec transport mémoire puis stdio : initialize, tools/list, tools/call, resources/list/read ; structuredContent identique au texte JSON ; erreurs avec isError ; entrée incorrecte/capacité absente sans réseau ; deux sessions ne partagent pas dossier actif ; masquage sur outils/ressources/claims/erreurs/cache, brut interdit en mode PII. **Hors périmètre :** prompts et catalogue futur exposé à vide.

## T13 — CLI et parcours hors ligne

**But :** relier les briques à une utilisation reproductible. **Dépendances :** T02/T06/T12. **Références :** 07 §2/3, 03.

**Livrables :** binaire `ebp-mcp`, sous-commandes login/logout/status/dossiers/serve, aide et codes de sortie, lancement de démonstration explicite `serve --mock` sans credentials, fixtures uniquement synthétiques ; instructions Inspector local.

**Acceptation :** process CLI démarré dans config temporaire : démarrage sans token, login mock, add avec validation distante simulée, list, serve, remove et logout ; mode mock ne peut émettre vers internet et est visible dans meta ; aucune sortie log sur stdout en serve ; arrêt SIGTERM ferme listener et attentes. **Hors périmètre :** envoi d'email, installation globale ou publication.

## T14 — Recette intégrée de la version mocks

**But :** clôturer v0.1 sur des preuves croisées. **Dépendance :** T13. **Références :** A01–A26, 09.

**Livrables :** rapport de recette dans docs/evidence, matrice outils/capacités, CI sans réseau EBP, parcours MCP Inspector documenté, `npm pack --dry-run` inspecté, liste précise des restrictions non validées.

**Acceptation :** gate commune ; scénarios complets profil A/B, dossier CPT/GC, 31e requête empêchée, expiration token concurrente, pagination client locale, PII et stdout ; bundle ne contient aucun secret, token, donnée client ou fichier de config utilisateur. Vérifier que tous les Axx ont résolution ou tâche/preuve différée. **Sortie :** autoriser T15, pas publication npm ni assertion « API compatible ».

## T15 — Validation réelle Hubbix et OAuth

**But :** remplacer les hypothèses Hubbix par des observations reproductibles. **Dépendance :** T14 + identifiants et dossiers préprod fournis par l'opérateur. **Références :** preuves E01–E07/E10 de 09.

**Livrables :** protocole de tests GET minimal, preuves anonymisées, corrections séparées de code/mapping, manifestes de fixtures avec provenance ; validation PKCE/redirect, pagination/tri, identités et monnaie, quota observé sans forcer son épuisement.

**Acceptation :** login + rotation + lecture d'un dossier de chaque famille Hubbix ; réponses comparées aux schémas ; bugs reproduits par tests ; chaque point non observable reste « inconnu » et capacité associée désactivée. Aucun token/secret ni capture client brute commité. **Blocage externe :** accès manquant = tâche bloquée, pas implémentation spéculative.

## T16 — Relevé des contrats SaaS par famille

**But :** produire le contrat exact nécessaire aux agents de code SaaS. **Dépendances :** T07/T15 + accès Gestion/Bâtiment. **Références :** 02 §4/6, E08/E09/E11/E12 de 09.

**Livrables :** mapping champ par champ des tiers/articles/ventes/achats/affaires ; liste exacte des tables, colonnes et enums par famille ; routes et pagination observées ; export du schéma d'application anonymisé ou extrait minimal ; différences Gestion/Bâtiment documentées. Contrats des outils SaaS et ressources manquantes de 04 complétés dans 07 avant code.

**Acceptation :** chaque champ obligatoire possède source, type, nullabilité, unité/devise, règle de droit et exemple ; cas `hasRight=false`, date aux bornes/futur, champ inconnu et orthographe Items vérifiés ; découverte limitée aux produits souscrits. **Hors périmètre :** croire CustomFields exhaustif, transformer une table wildcard en autorisation.

## T17 — Lecture SaaS Gestion puis Bâtiment

**But :** réutiliser les contrats communs avec deux manifestes vérifiés. **Dépendance :** T16. **Références :** 07 §8/9 et livrables T16.

**Livrables :** adapter SaaS paramétré, découverte dossiers paginée, lectures clients/articles/ventes/achats et affaires selon contrat validé, enrichissement des ressources ; tests par famille. Intégrer Gestion d'abord, puis activer Bâtiment seulement après sa recette propre.

**Acceptation :** tests contractuels identiques exécutés avec fixtures distinctes ; aucun nom de colonne inventé ; dates inclusives et limite supérieure ; droit refusé non contourné ; table non supportée refusée ; comparaison lecture réelle sur les deux familles. **Gate :** les quatre familles ont un rapport de compatibilité, avec capacités désactivées clairement listées.

## T18 — Contrats des outils experts et schéma

**But :** enlever toute syntaxe libre des futurs appels. **Dépendance :** T16. **Références :** 07 §9, 04 §4.7.

**Livrables :** contrat final `ebp_requete`, `ebp_decrire_table`, AST et opérateurs/types/arités, allowlist explicite par famille, jointures permises, tri stable, règles colonnes inconnues et custom fields, fixtures YAML et URLs attendues. Une sous-tâche de développement ne peut démarrer avant cette livraison revue.

**Acceptation :** cas d'égalité, IN vide, null, BETWEEN, dates, nombres, apostrophes/newlines, profondeur et nombre de feuilles ; preuve de colonnes/tables exactes ; aucun SQL/YAML/Column libre ; champs système sensibles exclus sauf besoin démontré. **Hors périmètre :** requête universelle permissive.

## T19 — GenericQuery et ressources de schéma

**But :** implémenter exclusivement T18. **Dépendances :** T17/T18. **Références :** 07 §9, 04 §4.7/5.

**Livrables :** compilation AST → YAML via serializer → paramètres URL, query paginée, décrire table et ressources schema/tables ; limites 500 et budget commun.

**Acceptation :** fixtures de T18 réutilisées comme contrat ; mutation d'entrée jamais interprétée comme YAML/SQL ; table/colonne non permise refusée avant réseau ; tri déterministe requis ; pagination multi-types sans perte ; schéma standard et custom clairement distingués.

## T20 — Exports asynchrones et reprise

**But :** télécharger un PDF/CSV sans jobs dupliqués. **Dépendance :** T17 + preuve E13. **Références :** 02 §5, 07 §9, A25.

**Livrables :** d'abord contrat exact des deux outils export/PDF, corps et modes, handle et durée de reprise ; ensuite routes POST strictement autorisées, machine d'états, polling GET, résultat en ressource binaire mémoire, cleanup. Paramètre modèle mappé seulement après preuve.

**Acceptation :** création unique, attente, résultat, chaque état terminal ; timeout POST ne relance pas la création ; timeout polling renvoie le handle existant ; reprise ne consomme pas un nouveau POST et refuse autre dossier/profil ; dépassement 10 Mio, mauvais MIME, quota/deadline, PII refusé, expiration ressource. **Hors périmètre :** Import et chemins de fichiers fournis par l'agent.

## T21 — Impayés, balance âgée et indicateurs courants

**But :** livrer les fonctions trésorerie fiables du catalogue. **Dépendances :** T15/T17 + E10/E14 selon famille. **Références :** 04 §4.4/4.5, 07 §8.

**Livrables :** contrats et fixtures métier pour `factures_impayees`, `balance_agee`, `encours_clients`, `indicateurs_ventes`, puis implémentation par capacités ; cohérence entre échéances et agrégats, date de situation explicite. Dashboards affichés avec périmètre observé ; pas de « mois courant » deviné.

**Acceptation :** deux échéances d'une facture ne doublent pas son total ; paiement partiel, avoir, date absente, échéance aujourd'hui ; tranches 30/31/60/61/90/91 ; zéro solde ; scan partiel ; date historique refusée sans historique ; noms clients identiques non fusionnés. CPT reste désactivé sans preuve des affectations. **Hors périmètre :** relances envoyées.

## T22 — CA et transformation devis par période

**But :** définir puis calculer des indicateurs sans double comptage. **Dépendance :** T21 + preuve E14. **Références :** 07 §8, A01/A15/A16.

**Livrables :** spécification revue des acomptes/factures finales/avoirs/annulations, période et statuts ; contrats des regroupements mois/client/article et N−1 ; `chiffre_affaires` et `taux_transformation_devis` activés seulement sur familles vérifiées.

**Acceptation :** facture 100 et avoir −20 donnent 80 ; acompte + facture finale correctement rapprochés ou capacité refusée ; multi-devises séparées ; groupe article sans lignes non inventé ; 29 février et N−1 zéro ; taux devis sans dénominateur null ; dashboard hors période jamais substitué. Comparaison manuelle à des documents de référence anonymisés. **Hors périmètre :** CA CPT via préfixe non prouvé.

## T23 — Prompts et guides FR/EN

**But :** rendre le catalogue utilisable sans masquer ses limites. **Dépendances :** T19/T20/T22. **Références :** 04 §5/6, 05.

**Livrables :** cinq prompts de 04, ressources restantes quand supportées, README et guide auth/config/dossiers/exemples/troubleshooting FR/EN, avertissement transmission des données au client LLM, mention communautaire.

**Acceptation :** chaque prompt ne référence que des outils présents, vérifie capacités et explique un résultat partiel ; demande de relance produit un brouillon sans envoi ; libellé malveillant reste une donnée ; guides exécutables depuis installation propre ; limites réelles par famille visibles. **Hors périmètre :** promesse d'écriture v1.x.

## T24 — Recette finale, paquet et publication npm

**But :** qualifier une version publique reproductible. **Dépendance :** T23 + preuves fournisseur suffisantes + conditions de publication remplies. **Références :** 01/05/09.

**Livrables :** recette des quatre familles, revue secrets/licence/CGU applicables, package contents allowlist, test d'installation du tarball npm en répertoire vide, changelog/version/tag, guide contributeur. Puis publication npm et registres selon autorisation de lancement distincte ; la demande actuelle autorise GitHub, pas encore une release npm.

**Acceptation :** gate commune, lancement du binaire depuis tarball et test MCP ; modes mock/live visibles ; aucun secret/donnée utilisateur ni dépendance native non documentée ; authentification préprod prouvée ; capabilities reflètent les éventuelles exclusions ; version et SHA traçables. **Hors périmètre :** écriture v1.x, serveur distant multi-utilisateurs, fonctionnalités non validées activées par défaut.

## Transfert GitHub → Paperclip après validation

1. Enregistrer la validation D01–D08 et corriger les décisions demandées. Initialiser Git local si nécessaire, contrôler les fichiers destinés au dépôt public, ajouter MIT et commiter le corpus. Vérifier le compte GitHub et l'état du dépôt avant création ; si un dépôt existe alors, récupérer/comparer son historique, sans force push. Cible prévue : `GoulvenF/ebp-mcp`, public, branche `main`.
2. Créer/publier le dépôt si absent, puis noter le SHA du corpus validé. La publication GitHub concerne le corpus préparatoire ; T01 créera ensuite le socle logiciel.
3. Créer le projet Paperclip `ebp-mcp` en `planned`, avec description, URL du dépôt et workspace Git attaché (`repoUrl`, branche `main`, primaire). Utiliser un checkout géré sur l'hôte Paperclip : ne pas enregistrer le chemin local `/home/goulven/git/ebp-mcp` comme s'il était accessible depuis son serveur.
4. Vérifier la société cible dans l'instance Paperclip : société Goulven. Vérifier l'absence d'un projet ebp-mcp avant création. Contrôler les réponses effectives des mutations ; ne pas changer les règles d'accès.
5. Importer les 24 fiches en ordre topologique, **non assignées, statut backlog**, avec `projectId`, clé d'idempotence `ebp-mcp:<version-du-corpus>:Txx` et vraies dépendances `blockedByIssueIds`. Pas de déclenchement d'agents implicite ; l'utilisateur a annoncé qu'il lancera l'implémentation ensuite. Si une tâche existe déjà, la mettre à jour après comparaison, pas la dupliquer.
6. Chaque description contient la fiche complète + règles communes + liens immuables `https://github.com/GoulvenF/ebp-mcp/blob/<SHA>/docs/07-contrats-v01.md` et `.../docs/08-backlog.md#tXX-...` vers les sections utiles ; ajouter lien courant `blob/main/docs/README.md`. Le SHA doit être réel, aucun placeholder dans Paperclip.
7. Écrire `docs/paperclip-index.md` avec URL projet, workspace, SHA du corpus et tableau Txx ↔ issue ID/URL ↔ dépendances ; commiter/pousser cet index séparément. Ce deuxième commit évite une référence circulaire au SHA du document qui se référence lui-même.
8. Relire le projet et les 24 tâches : dépôt primaire correct, liens résolus, dépendances exactes et sans cycle, tâches de code non démarrées. Rapporter les URLs et SHAs à Goulven. Une création partielle est reprise à partir de l'index/idempotence, jamais recommencée en doublon.

Les décisions techniques de ce backlog devront évoluer par commits du corpus puis mise à jour des tâches concernées, avec lien vers le diff. Une discussion Paperclip ne remplace pas une modification documentaire normative.
