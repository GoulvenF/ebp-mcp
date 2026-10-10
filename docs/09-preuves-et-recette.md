# 09 — Preuves fournisseur et recette

**Statut : aucune validation EBP réelle réalisée.** Une proposition acceptée fixe les choix du projet ; elle ne résout pas les inconnues fournisseur.

## Registre des preuves nécessaires

| ID | Question | Preuve minimale attendue | Consommateur | État |
|---|---|---|---|---|
| E01 | Redirect URI exacte et PKCE S256 | Login préprod réussi, configuration non secrète et résultat de callback ; aucune URL avec code/state dans le rapport | T15 / auth live | inconnu |
| E02 | Rotation et durée | Deux générations successives sans réutiliser l'ancienne ; champs d'expiration anonymisés ; politique de révocation si disponible | T15 / auth live | documenté, non testé |
| E03 | Produits, clés, domaine de quota | Produits souscrits, correspondance clé primaire/secondaire→abonnement, politique officielle ou confirmation EBP | T15 / quota | inconnu |
| E04 | Reset journalier, 429 et quota identité | Fuseau/période et headers de réponse documentés ; ne pas épuiser volontairement un quota pour tester | T15 / quota | inconnu |
| E05 | Dossiers et droits | Origine des IDs Hubbix, dossier autorisé et dossier refusé ; distinction prod/préprod | T15 / config | inconnu |
| E06 | Pagination et tris Hubbix | ≥2 pages, dernière page, max page, total, propriétés de tri réellement acceptées, stabilité des dates égales | T15 / recherche | documenté en partie |
| E07 | Comptabilité : catégories et banque | Types réels `category`, `nature`, filtres comptes exact/préfixe, status banque, nulls et lettrage partiel ; forme exacte des montants CPT (nombre JSON ou chaîne, nombre de décimales) sur `debit`/`credit`/`rate` (T09, D-T09-3) ; forme réelle du wrapper `/auxiliary-account-types` (supposition `{data:[...]}` non prouvée, T09) | T15 / CPT | inconnu |
| E08 | SaaS : schéma et droits | Colonnes/types/null/devise par objet, export schéma standard, champ hasRight refusé | T16 / SaaS | inconnu |
| E09 | SaaS : routes et dates | Orthographe Items ; un jour inclusif, date limite, date future ; pagination avec tri unique | T16 / SaaS | inconnu |
| E10 | GC : montants et dashboards | Convention signe avoirs, unité monétaire, période réelle des dashboards, sens échu/à-échoir | T15/T21/T22 | inconnu |
| E11 | Capacités Gestion vs Bâtiment | Listes exactes de tables et différences observées ; règles de jointure | T16/T18 | inconnu |
| E12 | Schéma CustomFields | Démontrer sa portée réelle ; compléter par export d'application pour tables standard | T16/T18 | portée standard non prouvée |
| E13 | Export | Corps exact, catégories, modèle, entityId, états, résultat MIME, liaison dossier/ID et reprise | T20 | documenté, non testé |
| E14 | Calculs analytiques | Cas facture finale/acompte/avoir/annulation/paiement partiel ; références métier attendues indépendantes du mapper | T21/T22 | inconnu |
| E15 | Distribution | CGU applicables, droits d'utilisation des exemples, identité package disponible, fichiers licence/mentions | T24 | à vérifier |

## Fixtures du corpus liées aux preuves (T03b)

Le corpus `tests/corpus/ebp/` ([lecture](../tests/corpus/README.md)) assume certaines incertitudes
fournisseur via `preuves_liees`. Un mock valide uniquement notre implémentation du contrat, pas la
réponse réelle d'EBP — ce tableau ne change pas l'état des lignes ci-dessus.

| Preuve | Fixtures du corpus |
|---|---|
| E06 | `compta-tiers-liste-data`, `compta-lines-entries`, `compta-general-account-liste`, `compta-journals`, `gescom-items-page-vide`, `gescom-items-pagination-invalide` |
| E07 | `compta-search-entries-tableau-nu`, `compta-domain-information`, `compta-folder-settings`, `compta-auxiliary-account-types`, `compta-auxiliary-account-detail`, `compta-general-account-detail`, `compta-entry-detail`, `compta-bank-transactions`, `compta-vat-rate` |
| E10 | `gescom-sale-documents-avoir-negatif`, `gescom-sale-commitments-fenetre-un-jour` |

## Format de preuve

Créer un fichier `docs/evidence/E<numero>-<sujet>.md` : date, famille, environnement, version API si disponible, hypothèse, requête **sans secret**, résultat synthétisé/anonymisé, conclusion étroite, limitations, fixtures et tests associés. Pas d'e-mail client, SIRET réel, nom de société cliente, IBAN, token, clé, code OAuth, HAR ni dump brut. Remplacer les IDs de façon cohérente ; préserver les relations et les cas aux limites.

États possibles : `inconnu`, `documenté`, `observé`, `confirmé` (observation + test de non-régression), `non_supporté`. Seul un résultat réel ou une précision officielle peut changer une inconnue fournisseur ; un mock valide seulement notre implémentation du contrat.

## Scénarios transverses obligatoires

| Scénario | Résultat attendu | Gate |
|---|---|---|
| Deux processus, même identité, token expiré | Un seul refresh ; génération durable partagée | T14 |
| Crash après départ refresh | Réauthentification explicite, aucun rejeu ancien token | T14 |
| Deux profils, même abonnement | Départs espacés et compteur unique | T14 |
| Un changement dossier pendant un scan | Scan termine sur dossier capturé | T14 |
| Page EBP 100 dont peu de matchs | Scan continue ; total filtré non inventé | T14 |
| Limite 50 au milieu d'une page | Reprise restitue le reste sans perte | T14 |
| Budget ou réserve épuisé avant premier résultat | Partiel explicite, pas succès exhaustif vide | T14 |
| 403 / réponse JSON incompatible | Erreur de droits / de schéma, pas approximation | T14 |
| Texte EBP contenant une instruction ou un secret ressemblant à un header | Donnée seulement ; pas d'exécution ni de contenu sensible dans les logs | T14 |
| PII sur tool, ressource, erreur, claims, cache, brut | Politique centrale, refus du brut en mode masquage | T14 |
| Lecture réelle sur chaque famille | Preuve et capabilities reflétant le support observé | T17 |
| Facture, avoir et acompte | Calcul métier indépendant, aucun double compte | T22 |
| Tarball installé en répertoire vide | Binaire/MCP fonctionnent sans fichiers du checkout | T24 |

## Définition des jalons

- **v0.1 prête sur mocks :** T01–T14 terminées, 17 outils et ressources contractuelles, aucun accès EBP nécessaire ; limites live visibles.
- **v0.2 validée :** T15–T17 terminées, preuves sur quatre familles, mappings inconnus désactivés ; ne pas confondre présence d'un adapter et couverture complète des capacités.
- **v0.3 publiable :** T18–T24 satisfaites et conditions de release remplies. Toute exclusion du catalogue cible est explicitée dans la matrice de capacités et revue avant annonce.
- **v1.x écriture :** hors du présent backlog. Le simple ajout d'un flag n'est pas une implémentation autorisée.
