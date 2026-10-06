# 05 — Sécurité & conformité

> **Relecture du 2026-10-06 :** voir [audit et arbitrages](06-audit.md). Les [contrats précis](07-contrats-v01.md) et le [backlog](08-backlog.md) ont été validés par Goulven le 2026-10-06 et priment sur les formulations générales ci-dessous. Le catalogue v1 ne définit pas à lui seul le contenu de v0.1.

## Garde-fous techniques
- **Lecture seule par construction (v1)** : le client HTTP valide méthode + route + origine, y compris pour GET ; token POST séparé, exports explicitement autorisés seulement au jalon correspondant (07 §4). Tests dédiés.
- Endpoints de maintenance (`UnlogAll`, `UnlockAll`) **jamais** exposés.
- `ebp_requete` (GenericQuery) : table validée contre la liste autorisée, plafond de lignes, colonnes obligatoires (pas de `*` implicite), timeout.
- Écriture future : `EBP_ALLOW_WRITE=true` + `dry_run` par défaut + confirmation.

## Respect du fournisseur (charte EBP)
- Rate limiter côté client **strictement** sous le quota (1 req/s, 10 000/jour) : un agent qui boucle ne doit pas faire sanctionner l'abonnement de l'utilisateur.
- Budget d'appels par outil + arrêt net si le quota journalier restant passe sous un seuil (`EBP_QUOTA_RESERVE`, défaut 500) pour préserver les autres usages de l'abonnement.
- User-Agent explicite : `ebp-mcp/<version> (+https://github.com/GoulvenF/ebp-mcp)`.

## Secrets
- Aucun secret dans le dépôt ; `.env` dans `.gitignore`, `.env.example` fourni.
- Tokens en fichier sécurisé en v0.1 proposée (07 §3), trousseau différé.
- **Aucun token, secret ni subscription key dans les logs** (redaction systématique des headers `Authorization`, `ebp-subscription-key`, et des paramètres `code`, `refresh_token`).
- Logs sur `stderr` uniquement (stdout réservé au protocole MCP).
- Les identifiants de dossiers Hubbix (`tenantId`, `domainId`) ne sont pas secrets mais restent hors du dépôt (config utilisateur).

## Données personnelles (RGPD)
- Les données transitent du SaaS EBP vers le client MCP et donc potentiellement vers un fournisseur de LLM : le README doit le signaler clairement.
- Option `EBP_REDACT_PII=true` : masquage des e-mails, téléphones, IBAN dans tous les canaux de sortie ; brut et exports binaires refusés dans ce mode (07 §7). Ce n’est pas une anonymisation générale.
- Pas de cache disque des données métier en v1 ; cache mémoire des référentiels 1 h et listes transactionnelles 60 s, isolé par contexte (07 §5).

## Prompt injection
- Les contenus EBP (libellés, commentaires, notes) sont des **données non fiables** : renvoyés comme données structurées, jamais interprétés comme instructions.
- En lecture seule, l'impact est limité ; en v1.x l'écriture exigera une confirmation humaine.

## Juridique
- Mention « projet non affilié à EBP Informatique ; EBP est une marque de son propriétaire ».
- Modèle BYO-credentials : chaque utilisateur est soumis à ses propres CGU EBP.
- **À vérifier avant publication** : compatibilité des CGU du portail développeur avec un client open source.
