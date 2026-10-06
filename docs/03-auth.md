# 03 — Authentification

> **Relecture du 2026-10-06 :** voir [audit et arbitrages](06-audit.md). Les [contrats précis](07-contrats-v01.md) et le [backlog](08-backlog.md) ont été validés par Goulven le 2026-10-06 et priment sur les formulations générales ci-dessous. Le catalogue v1 ne définit pas à lui seul le contenu de v0.1.

## Ce qu'impose EBP ✅
| Élément | Valeur |
|---|---|
| Flux | OAuth 2.0 **Authorization Code uniquement** (pas de client_credentials) |
| Authorize | `https://api-login.ebp.com/connect/authorize` |
| Token | `https://api-login.ebp.com/connect/token` |
| Scopes | `openid profile offline_access` |
| Code d'autorisation | 5 min, usage unique |
| Access token (JWT) | 1 h |
| Refresh token | 30 jours, **usage unique (rotation)** |
| Redirect URI autorisée | `http://localhost:3333` (tableau de la doc) ⚠️ l'exemple de requête utilise `https://localhost:3333/api/login/SigninRedirect` → ne pas supposer une correspondance par préfixe ; URI exacte à confirmer. Autres URI : demande à `revendeurs.fr@ebp.com` |
| Échange / refresh | `POST /connect/token`, corps `application/x-www-form-urlencoded`, **`client_id` + `client_secret`** (client confidentiel) |
| Claims du JWT | `ebp.email`, `family_name`, `given_name` — **aucune info de dossier** |
| Page de login | Pages EBP non personnalisables ; pas d'authentification machine-to-machine |
| Headers d'appel | `Authorization: Bearer <jwt>` + `ebp-subscription-key: <clé primaire ou secondaire>` |

PKCE : non mentionné 🟡. Proposition 07 §3 : S256 complet par défaut, aucun fallback automatique ; mode désactivé explicitement après validation de compatibilité.

> **Conséquence open source** : le `client_secret` ne peut pas être embarqué dans le paquet npm. Chaque utilisateur demande **son propre abonnement** (BYO credentials) — la charte autorise d'ailleurs le client à partager ses codes avec son revendeur.

## Obtention des identifiants (côté utilisateur)
1. Créer un compte sur developpeurs.ebp.com avec ses identifiants EBP.
2. Demander le(s) produit(s) API (Hubbix Compta, Hubbix GesCom, SaaS Gestion, SaaS Bâtiment), nom de société, acceptation des CGU.
3. Validation manuelle EBP → `client_id` / `client_secret` par e-mail, clés d'abonnement dans le profil du portail.

## Configuration
Variables d'environnement (ou fichier `~/.config/ebp-mcp/config.json`) :

| Variable | Rôle |
|---|---|
| `EBP_CLIENT_ID` | client OAuth |
| `EBP_CLIENT_SECRET` | secret OAuth |
| `EBP_SUBSCRIPTION_KEY` | header `ebp-subscription-key` |
| `EBP_ENV` | `prod` (défaut) \| `preprod` |
| `EBP_PROFILE` | nom de profil (défaut `default`) |
| `EBP_REDIRECT_URI` | défaut `http://localhost:3333` (port d'écoute déduit de l'URI) |

### Déclaration des dossiers Hubbix
Aucune API ne liste les dossiers Hubbix (`tenantid` Compta, `DomainId` GesCom) : ils sont **déclarés dans la config** (les dossiers SaaS sont, eux, découverts via `GET /Folders`).

Exemple initial de profil ; le schéma complet proposé (version, groupes de quota et dossiers par environnement) est dans 07 §2. Ne pas copier cet exemple comme fixture du nouveau schéma.

```jsonc
// ~/.config/ebp-mcp/config.json
{
  "profiles": {
    "default": {
      "env": "prod",
      "clientId": "…",                  // secrets : env ou trousseau de préférence
      "dossiers": [
        { "alias": "acme-compta", "famille": "hubbix-compta", "tenantId": "0189abef-…" },
        { "alias": "acme-gc",     "famille": "hubbix-gescom", "domainId": "08000000-…" }
      ],
      "defaultDossier": "acme-gc"
    }
  }
}
```
Commande d'aide : `ebp-mcp dossiers add --famille hubbix-gescom --id <guid> --alias acme-gc` (valide l'ID par un appel test : `domain-information` pour Compta, `vat-rates` pour GesCom).

## Parcours CLI
```
ebp-mcp login   [--profile p] [--env preprod]   # ouvre le navigateur, stocke les tokens
ebp-mcp status  [--profile p]                   # utilisateur (claims), expiration refresh, dossiers, quota du jour
ebp-mcp dossiers list|add|remove                # dossiers SaaS découverts + Hubbix déclarés
ebp-mcp logout  [--profile p]                   # supprime les tokens
ebp-mcp serve   [--profile p]                   # serveur MCP stdio (commande par défaut)
```

### `login`
1. Génère `state` (+ `code_verifier` et challenge S256 PKCE).
2. Démarre un serveur HTTP éphémère sur `localhost:3333`.
3. Ouvre le navigateur sur `/connect/authorize?response_type=code&response_mode=query&client_id=…&redirect_uri=<EBP_REDIRECT_URI>&scope=openid%20profile%20offline_access&state=…&code_challenge=…&code_challenge_method=S256` en mode PKCE (affiche aussi l'URL dans le terminal pour les environnements sans navigateur).
4. Reçoit `?code=…&state=…`, vérifie `state`, échange le code sous 5 min sur `/connect/token` (`grant_type=authorization_code`, `client_id`, `client_secret`, `redirect_uri`, `code`, `code_verifier` en mode PKCE).
5. Persiste les tokens, échéances et génération selon 07 §3 (`id_token` non exigé) dans le store du profil, puis ferme le serveur.

### `serve` — cycle de vie des tokens
- Avant chaque appel : si `expires_at - 60s < now` → refresh.
- Sur `401` : un seul refresh puis rejeu ; échec → erreur MCP explicite « relancez `ebp-mcp login` ».
- **Rotation** : le refresh token est à usage unique → la nouvelle paire est **écrite de façon atomique** (fichier temporaire + `rename`) **avant** d'être utilisée.
- **Concurrence** : verrou fichier par identité profil/env/client avec relecture sous lock (plusieurs clients MCP peuvent lancer le serveur en parallèle) + mutex en mémoire pour qu'un seul refresh soit en vol.
- Refresh expiré (> 30 j d'inactivité) → re-login manuel requis ; `status` affiche une échéance estimée, pas une garantie contre révocation.
- Le refresh compte-t-il dans le quota de 10 000 appels/jour ? 🟡 (hôte différent, probablement non).

## Stockage
- Proposition D06 : store fichier sécurisé unique en v0.1 ; trousseau OS différé.
- Store : racine XDG puis `~/.config/ebp-mcp`, identité profil/env/client, permissions `0600`, répertoire `0700` sur POSIX (07 §2–3).
- Multi-profils = multi-comptes EBP. Le **choix du dossier** (FolderId / tenantid / DomainId) est indépendant du profil et se fait à l'exécution (`ebp_choisir_dossier`).

## Hors périmètre v1
- Serveur MCP distant avec OAuth MCP (le client MCP s'authentifierait auprès de notre serveur, qui relaierait vers EBP) : nécessite une redirect URI publique validée par EBP.
