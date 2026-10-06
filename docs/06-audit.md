# 06 — Audit avant implémentation

Date : 2026-10-06. **Statut : validé par Goulven le 2026-10-06, décisions D01–D08 acceptées sans amendement.**

## Conclusion

Le projet peut démarrer sur mocks après validation des contrats de [07](07-contrats-v01.md). Les documents 01–05 définissent une vision utile, mais ne suffisent pas à confier le développement à plusieurs agents sans arbitrages. Il n'y a actuellement ni code, ni tests, ni manifeste npm, ni dépôt Git local. La commande `gh repo view GoulvenF/ebp-mcp` ne résout pas le dépôt à la date de l'audit : son existence publique n'est donc pas établie.

La couverture des quatre familles et le catalogue cible sont conservés. La proposition distingue une première livraison testable, les fonctions qui exigent une validation EBP et la publication. Une réussite sur mocks ne prouve pas la compatibilité réelle.

## Arbitrages validés le 2026-10-06

| ID | Décision proposée | Motif |
|---|---|---|
| D01 | v0.1 = socle + 17 outils précisément définis dans 07, sur les deux familles Hubbix ; catalogue complet conservé pour la suite | Réduire les interprétations et rendre chaque livraison vérifiable |
| D02 | Node 24 LTS comme référence, npm, ESM, TypeScript strict ; versions compatibles SDK/Zod figées au démarrage | Node 20 est arrivé en fin de support ; éviter des versions implicites |
| D03 | Montants JSON en chaînes décimales, calcul décimal exact ; monnaie inconnue = `null` | Empêcher perte de précision, arrondis précoces et EUR inventé |
| D04 | Aucun rapprochement automatique de tiers entre Compta et GesCom ; pas d'échéancier comptable approximé à partir des seules lignes non lettrées | Les identifiants et les notions de solde ne sont pas interchangeables |
| D05 | Pas de CA avec acomptes ni de balance âgée historique avant preuve du modèle de données ; signe des avoirs normalisé une seule fois | Empêcher des indicateurs plausibles mais faux |
| D06 | Stockage fichier sécurisé et locks locaux d'abord ; trousseau OS ultérieur | Éviter deux implémentations concurrentes de persistance dès v0.1 |
| D07 | Quota partagé entre processus par groupe d'abonnement configuré ; compteur local explicitement estimatif | Le profil OAuth n'est pas nécessairement l'unité de quota EBP |
| D08 | Validation ici, puis commit/push GitHub, création du projet Paperclip et import du backlog lié au commit | Respecter la demande de validation préalable et garantir des références documentaires stables |

D09 n'est pas un arbitrage de ce tableau : c'est la mise en application de D02 et A23 par Lead Tech au titre de T01, consignée dans [10](10-socle-versions.md). Elle fige les versions exactes du socle et la bibliothèque décimale sans modifier les contrats de 07.

## Erreurs et lacunes identifiées

P0 = risque de données fausses, fuite ou auth inutilisable ; P1 = ambiguïté bloquant une implémentation fiable ; P2 = documentation ou périmètre à clarifier. Les emplacements désignent les formulations initiales, corrigées ou remplacées par 07.

| ID | Priorité | Emplacement | Problème concret | Résolution / vérification |
|---|---|---|---|---|
| A01 | P0 | 04 §4.5 | « factures + acomptes − avoirs » alors que 02 décrit des avoirs négatifs : double inversion possible ; acompte potentiellement recompté sur facture finale | Règles métier 07 §8 ; scénario facture 100, avoir −20 → 80 ; acomptes bloqués sans rapprochement |
| A02 | P0 | 04 §4.6 et modèle | `number`, arrondi systématique à deux décimales : prix unitaires et calculs intermédiaires perdent de la précision | Chaînes décimales, bibliothèque décimale et tests de précision ; devise explicite |
| A03 | P0 | 04 §4.4 | Ligne 411 non lettrée ≠ facture impayée : paiements, avoirs, lettrages partiels et à-nouveaux | Ne pas annoncer cette capacité CPT en v0.1 ; test de capacité sans appel réseau |
| A04 | P0 | 04 §4.2 | Un compte auxiliaire Compta n'est pas un `customerId` GC ; un nom n'est pas une clé | Pas de bascule silencieuse entre dossiers ; identifiants qualifiés par famille/dossier |
| A05 | P0 | 03 cycle des tokens | Un mutex seul ou un lock sans relecture ne protège pas plusieurs processus ; crash après rotation = ancien token consommé | Relecture sous lock, génération de tokens, marqueur durable avant refresh, état indéterminé sans rejeu |
| A06 | P0 | 03 PKCE / login | PKCE annoncé mais `code_challenge` absent ; fallback automatique possible ; URI présumée acceptée par préfixe | PKCE S256 complet ; aucun downgrade automatique ; URI exacte et preuve préprod |
| A07 | P0 | 04 quota / 05 | Limiteur par profil et compteur non coordonné permettent de dépasser le quota d'un abonnement partagé | Groupe de quota persistant + lock interprocessus ; essais et 401 rejoués comptés |
| A08 | P0 | 05 guard | Autoriser tous les GET et des POST par fragment de nom est trop large | Liste de routes typées, hôte autorisé, pas d'URL fournie par l'outil, redirections refusées |
| A09 | P0 | 05 PII | Le brut, les ressources, les erreurs, les claims et les PDF peuvent contourner un masquage des seuls outils | Politique centrale ; `inclure_brut` refusé si masquage ; exports binaires incompatibles avec ce mode |
| A10 | P1 | 04 §4.3 | `Duration = au − du` omet un jour sur une fenêtre inclusive et vaut 0 sur un seul jour | `+1` jour civil, borne supérieure contrôlée séparément ; tests début/fin et date future |
| A11 | P1 | 04 pagination | `hasMore`/curseur en sortie sans curseur en entrée ; filtre local incompatible avec total EBP global | Contrat de reprise avec éléments tamponnés, total filtré nullable, curseur lié au contexte |
| A12 | P1 | 04 budget | 30 requêtes ≠ 30 secondes en cas de latence, attente ou retry ; comportement de quota zéro absent | Budget et deadline séparés ; succès partiel uniquement pour interruptions attendues |
| A13 | P1 | 04 détail | ID seul ne donne ni type ni statut pour router un document ; articles bien/service idem | Référence explicite ; résolution par numéro/code paginée et unicité prouvée |
| A14 | P1 | 04 filtre tiers GC | Liste des documents et règlements ne fournit pas toujours un ID client | Enrichissement borné pour documents ; filtre ID refusé pour règlements sans preuve d'identité |
| A15 | P1 | 04 indicateurs | Dashboard sans période utilisé pour période utilisateur ; « CA mensuel » et retard inversés non vérifiés | Pas de réinterprétation ; période inconnue exposée, agrégation temporelle distincte |
| A16 | P1 | 04 balance âgée | Solde restant actuel ne reconstitue pas le solde à une date passée ; tranches non échues absentes | Courant seulement avant historique des affectations ; tranche non échue explicite |
| A17 | P1 | 02 / 04 CustomFields | Champs personnalisés supposés fournir le schéma complet des tables standard | Export du schéma d'application requis ; `CustomFields` insuffisant tant que non prouvé |
| A18 | P1 | 02 familles SaaS | « strictement identiques » trop fort ; liste 69 tables comporte jokers et ellipses | Adapter partagé autorisé, manifeste de capacités et liste de tables par famille |
| A19 | P1 | 03 configuration | Précédence env/fichier/CLI, familles activées, stockage multi-env et sélection de clé absents | Configuration déterministe dans 07 ; identité des stores séparée par environnement |
| A20 | P1 | 04 / 05 cache | Cache transactionnel 60 s d'un côté, référentiels uniquement de l'autre ; clés et invalidation absentes | Deux caches mémoire explicitement autorisés, clés liées à l'identité et au dossier |
| A21 | P1 | 04 sortie | JSON métier ≠ réponse MCP ; erreurs outil, ressources et annotations absentes | Enveloppe MCP, `structuredContent`, `isError`, capacités dans 07 |
| A22 | P1 | 02 préprod | Support PKCE, schémas SaaS, tri, reset quota, clés par produit et devise restent des hypothèses | Registre de preuves 09 ; aucune fixture synthétique ne ferme une question EBP |
| A23 | P2 | 01 stack | Node ≥20 permet une version hors support | Node 24 de référence, versions de dépendances verrouillées |
| A24 | P2 | 01 état de l'art / juridique | « Aucun concurrent » et « aucune clause n'interdit » sont des conclusions trop catégoriques | Présenter comme observations à revalider, pas garanties ; vérification CGU avant publication |
| A25 | P1 | 04 exports | Reprise via `exportId` promise sans entrée dédiée, polling pouvant épuiser budget ; créations rejouables ambiguës | Reprise sans nouvelle création, contrôle du contexte, limites de taille et temps |
| A26 | P1 | 04 modèle comptable | Identité de ligne absente ; comptes courts/longs et statut bancaire inconnu | Ajouter `id` de ligne ; comptes chaînes intactes ; enum inconnu jamais converti silencieusement |

## Sources et limites de vérification

- [Documentation EBP](https://developpeurs-storage.ebp.com/) consultée le 2026-10-06 : contrôle ciblé de l'authentification, wrappers comptables, filtres temporels et portée de `CustomFields`. Cette relecture n'est pas un test d'API. Les contradictions d'exemples ne permettent pas de conclure sur le comportement du serveur.
- [Cycle de vie Node.js](https://nodejs.org/en/about/previous-releases) : Node 20 est EOL à la date de l'audit ; proposition de référence Node 24.
- [MCP, outils](https://modelcontextprotocol.io/specification/2025-11-25/server/tools) : distinguer résultat d'outil et erreur protocolaire ; déclarer schémas et annotations.
- [RFC 9700](https://www.rfc-editor.org/rfc/rfc9700.html) : base des exigences proposées de PKCE et protection des redirections. L'acceptation par l'IdP EBP reste à éprouver.

Aucun accès métier EBP, aucun test de compte réel, aucune écriture Paperclip ni publication effectués dans cet audit. Les règles de calcul proposées sont des contrats du produit, à valider par fixtures métier et comparaison préprod ; elles ne constituent pas une validation comptable réglementaire.
