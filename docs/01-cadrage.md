# 01 — Cadrage

> **Relecture du 2026-10-06 :** voir [audit et arbitrages](06-audit.md). Les [contrats précis](07-contrats-v01.md) et le [backlog](08-backlog.md) ont été validés par Goulven le 2026-10-06 et priment sur les formulations générales ci-dessous. Le catalogue v1 ne définit pas à lui seul le contenu de v0.1.

**Projet** : [`GoulvenF/ebp-mcp`](https://github.com/GoulvenF/ebp-mcp) (cible : dépôt public GitHub perso, publication à effectuer) · **npm** : `@goulvenf/ebp-mcp` · **Licence** : MIT

## Vision
`ebp-mcp` est un serveur MCP (Model Context Protocol) open source qui expose les données des logiciels **EBP en mode Cloud/SaaS** à des agents IA (Claude, et tout client MCP), via une **couche sémantique métier** plutôt qu'un simple miroir des endpoints.

> Projet communautaire, **non affilié à EBP Informatique**.

## État de l'art (oct. 2026)
| Existant | Constat |
|---|---|
| Serveur MCP EBP officiel / communautaire | Aucun identifié lors du cadrage initial ; recherche non exhaustive à revalider avant publication |
| Unified.to (EBP Compta, EBP GesCom Open Line) | Passerelle payante, bêta, périmètre minimal (contacts, articles, comptes, journaux) |
| SDK EBP TypeScript / Python | Aucun identifié lors du cadrage initial ; recherche non exhaustive |
| Références d'inspiration | `ivnvxd/mcp-server-odoo` (resources vs tools, permissions), `pantalytics/odoo-mcp-pro` (OAuth, multi-sociétés), PennyPilot / Pennylane (read-only guard), Sage Intacct AI Gateway |

## Objectifs
1. Permettre à un agent de **lire et analyser** les données EBP d'un ou plusieurs dossiers : tiers, articles, documents de vente/achat, échéances, comptabilité.
2. Offrir des **outils orientés intention** (« factures impayées », « CA par mois ») plutôt que des appels bruts.
3. Gérer l'**authentification OAuth2 EBP** de façon transparente (login unique, rafraîchissement automatique).
4. Être **sûr par défaut** : lecture seule en v1.
5. Être **installable en une commande** (`npx @goulvenf/ebp-mcp`) et documenté en FR/EN.

## Périmètre v1
| Famille d'API | Inclus |
|---|---|
| Hubbix Comptabilité TPE | ✅ lecture |
| Hubbix Gestion Commerciale TPE | ✅ lecture |
| SaaS API Gestion Commerciale | ✅ lecture (+ GenericQuery, Export) |
| SaaS API Bâtiment | ✅ lecture (même adapter que Gestion) |

## Non-objectifs (v1)
- EBP **Desktop / on-premise** (pas d'API web ; SDK partenaire réservé aux versions « Local Abonnement »).
- **Paie**, CRM autonome (aucune API identifiée).
- **Écriture** (création de pièces, écritures comptables) → v1.x derrière un flag.
- Serveur distant multi-utilisateurs (redirect URI à faire valider par EBP) → étude ultérieure.

## Personas
- **Dirigeant TPE** : « Qui me doit de l'argent ? », « Mon CA du trimestre vs l'an dernier ? »
- **Comptable / cabinet** : contrôle d'écritures, balance, rapprochement bancaire, multi-dossiers.
- **Développeur d'agents** : brique fiable pour automatiser relances, reporting, synchronisations.

## Contraintes
- Accès API soumis à **validation manuelle EBP** (portail developpeurs.ebp.com) et à un abonnement SaaS côté client.
- **Charte d'utilisation EBP** (publique dans la doc) : usage professionnel, pas d'activité concurrente ni préjudiciable à EBP, prudence et confidentialité. Compatibilité des CGU avec la distribution à vérifier avant publication. Modèle *Bring Your Own Credentials* : chaque utilisateur fournit son `client_id`, `client_secret` et sa `ebp-subscription-key` ; aucun secret dans le dépôt. Validation de l'abonnement sous 72 h.
- **Quota (phase Early Adopters)** : **1 appel/seconde et 10 000 appels/jour** par abonnement, 100 éléments max par page → contrainte structurante pour les agrégations (voir 04).
- Pas de sandbox publique : développement **mock-first** sur fixtures dérivées de la documentation, puis validation sur la préproduction EBP.

## Choix techniques
- **TypeScript**, Node 24 LTS proposé par D02 (le minimum Node 20 initial est hors support), `@modelcontextprotocol/sdk`, `zod`.
- Transport **stdio local** (Claude Desktop, Claude Code, Cursor…).
- Licence : **MIT** ✅. Dépôt GitHub public prévu `GoulvenF/ebp-mcp` (https://github.com/GoulvenF/ebp-mcp).
- Tests : `vitest` + MCP Inspector.

## Roadmap
| Version | Contenu |
|---|---|
| v0.1 | Socle : auth CLI, client HTTP (rate limit, quota, refresh), config dossiers + **Hubbix GesCom & Compta** lecture sur mocks (schémas de réponse documentés → fixtures fiables) |
| v0.2 | **SaaS Gestion/Bâtiment** lecture (schémas à relever sur l'API réelle), validation préprod de toutes les familles |
| v0.3 | Outils experts (`ebp_requete`, export PDF), prompts ; publication npm `@goulvenf/ebp-mcp` + registres MCP |
| v1.x | Écriture (clients, articles, devis, factures, puis écritures) avec preview + confirmation |

## Décisions actées (2026-10-06)
- Couverture **complète** des 4 familles (Hubbix Compta, Hubbix GesCom, SaaS Gestion, SaaS Bâtiment) — toutes à tester en préprod.
- Catalogue cible de [04](04-semantic-layer.md) conservé ; corrections et séquencement proposés dans 06–08.
- Budget d'appels dépassé → **résultat partiel** marqué `approximatif: true` + explication (pas d'erreur).
- Implémentation dans une session dédiée, à partir de v0.1.

## Questions ouvertes
Voir la checklist de validation préprod dans [02-api-map.md §6](02-api-map.md#6-points-à-valider-sur-lapi-réelle-checklist-préprod). Les plus structurantes :
- Découverte des dossiers Hubbix (aucune API : saisie manuelle en attendant).
- Schéma réel des réponses SaaS (documents, articles, affaires).
- Redirect URI / PKCE.
