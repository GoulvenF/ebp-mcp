# 07 — Contrats d'implémentation

**Contrats validés par Goulven le 2026-10-06.** Les décisions D01–D08 sont recensées dans [06](06-audit.md). Ce document prévaut sur les formulations générales de 01–05 pour les points qu'il précise. Il décrit des choix du projet, pas des garanties de l'API EBP.

## 1. Livraison et architecture

v0.1 est une version de développement testable hors ligne. Deux adapters : `hubbix-compta`, `hubbix-gescom`. Les quatre familles restent la cible v1. Pas de publication npm avant la recette réelle. Ne pas créer des implémentations factices SaaS qui renverraient un succès vide.

Socle : Node 24 LTS, npm avec lockfile, ESM, TypeScript strict, SDK MCP officiel et Zod dans des versions compatibles verrouillées, Vitest. Choisir une bibliothèque décimale maintenue au lot T01 et la fixer ; ne pas implémenter une arithmétique décimale maison.

```text
src/cli.ts                 commandes, injection des dépendances, codes de sortie
src/config/                validation et résolution du profil
src/auth/                  login, TokenStore, refresh, verrou
src/http/                  routes autorisées, transport, quota, retry
src/domain/                objets, décimaux, dates, erreurs, capabilities
src/adapters/hubbix-*/      schémas EBP, mapping, lecture d'une page
src/services/              recherche, budget, pagination, agrégations
src/mcp/                   schémas outils, enveloppes, ressources
tests/fixtures/            réponses EBP synthétiques et manifestes
tests/integration/         transport injecté, puis protocole stdio
docs/evidence/             preuves anonymisées et questions résolues
```

Sens des dépendances : MCP/CLI → services → adapters → client HTTP. `domain` ne dépend ni de MCP, ni du réseau, ni du disque. Les adapters ne font pas de refresh, retry, boucle de pagination ou calcul métier. Chaque requête réseau, y compris un enrichissement et une ressource, traverse le même client.

Ports minimaux à définir en T01 : `Clock` (instant, attente annulable), `HttpTransport` (requête, signal), `TokenStore`, `LockManager`, `QuotaStore`, `Adapter.readPage`, `ExecutionContext`. Ce dernier capture profil, environnement, génération d'identité, dossier, budget, deadline et signal à l'entrée de l'appel. Aucun singleton de « dossier courant » dans un adapter.

## 2. Configuration, dossiers et CLI

Racine : `$XDG_CONFIG_HOME/ebp-mcp`, sinon `~/.config/ebp-mcp`. `config.json` contient `schemaVersion: 1`, `profiles` et `quotaGroups`. Les exemples publics emploient uniquement des identifiants synthétiques. Profils, alias et groupes : `[a-z0-9][a-z0-9_-]{0,63}` ; IDs distants restent des chaînes opaques non vides, encodées comme segments de chemin. GUID Hubbix validés syntaxiquement.

Schéma du profil : `env: prod|preprod`, `clientId`, `clientSecret?`, `subscriptionKey?`, `redirectUri`, `pkce: required|disabled` (défaut required), `enabledFamilies`, `subscriptionByFamily?`, `quotaGroup` (groupe par défaut), `dossiers`, `defaultDossier?`. Une entrée `subscriptionByFamily` contient `key` et `quotaGroup` et remplace le couple par défaut pour cette famille. La présence de secrets en fichier est possible avec permissions restrictives ; env recommandé. Les CLI `status` et les outils ne sérialisent jamais cette config.

Groupe de quota : `maxPerDay` défaut 10000, `reserve` défaut 500, `minIntervalMs` défaut 1000, `resetTimezone` défaut Europe/Paris. Le fuseau est une convention locale à confirmer auprès d'EBP. Plusieurs profils/clefs primaire et secondaire d'un même abonnement doivent utiliser le même groupe. Ce regroupement ne peut pas être déduit du contenu d'une clé.

Précédence : sélection `--profile` > `EBP_PROFILE` > `default` ; pour les options exposées, flag CLI > variable env > profil > défaut documenté. `EBP_SUBSCRIPTION_KEY` remplace la clé par défaut, pas une clé spécifique de famille ; `EBP_QUOTA_RESERVE` remplace la réserve de tous les groupes utilisés par le processus. Env vide = configuration invalide, pas fallback implicite. Variables supplémentaires : `EBP_REDACT_PII`, `EBP_ENV`, `EBP_REDIRECT_URI`, `EBP_CLIENT_ID`, `EBP_CLIENT_SECRET`.

Identité de stockage auth = profil + environnement + empreinte du client ID. Changer l'un de ces éléments ne réutilise pas des tokens d'un autre contexte. Les dossiers sont configurés **par environnement** : `dossiers` est un objet `{prod: Dossier[], preprod: Dossier[]}`, `defaultDossier` un objet facultatif par environnement. Dossier normalisé : `{alias, famille, id, nom: string|null}`. La config conserve `tenantId`/`domainId` selon la famille, mais les services ne manipulent que le modèle normalisé. Aucun appel de découverte d'une famille non activée.

Résolution d'un outil : argument `dossier` > dossier actif de sa session > défaut de cet environnement. Sinon `DOSSIER_REQUIRED`, même si un seul dossier existe. Alias inconnu : erreur, aucune sélection de secours. `ebp_choisir_dossier` ne modifie pas la config persistée. Une requête en vol conserve le dossier capturé avant tout changement concurrent.

Commandes : `serve` (défaut), `login`, `logout`, `status`, `dossiers list|add|remove`. Flags communs profil/env ; `dossiers add --famille ... --id ... --alias ...` valide un appel de lecture avant persistance ; refus sans modifier la config si l'appel échoue. Suppression du dossier par défaut efface ce défaut ; suppression d'un alias absent = erreur de saisie. `status` et `dossiers list` v0.1 n'accèdent pas au réseau. En v0.2, découverte SaaS via option explicite `dossiers list --refresh`, puis persistance des seuls identifiants/noms de dossiers. `logout` invalide les tokens sous le lock auth et les caches de cette identité lors de la prochaine vérification de génération.

CLI : code 0 succès, 2 entrée/config invalide, 3 auth requise, 1 autre échec. Mode `serve` : stdout MCP exclusivement, logs stderr. `serve` peut démarrer sans tokens pour exposer statut et capacités ; un outil métier échoue alors avec `AUTH_REQUIRED`. Aucune ouverture automatique du navigateur depuis un outil MCP.

## 3. Authentification et persistance

- Store fichier v0.1 : répertoire 0700, fichiers 0600 sur POSIX, pas de secret dans les noms de fichiers ; fichier temporaire dans le même répertoire, écriture complète, flush, renommage atomique. Échec de persistance = échec auth, pas de token nouveau utilisé uniquement en mémoire. Windows : ne pas prétendre que chmod fournit des ACL ; support réel à qualifier avant le déclarer.
- Login : listener sur loopback exclusivement, route/path exact de `redirectUri`, port occupé = erreur ; ne pas changer silencieusement l'URI autorisée. `state` aléatoire à usage unique ; timeout de session 5 minutes ; requête étrangère/mauvais state ne consomme pas le state valide. Un seul échange du code. Page callback sans token, `Cache-Control: no-store`, `Referrer-Policy: no-referrer`.
- PKCE required : générer verifier et challenge S256, envoyer challenge/méthode à authorize et verifier à token. Échec de compatibilité = erreur explicite. Le mode disabled exige une configuration explicite après validation préprod, jamais de seconde tentative automatique sans PKCE.
- Tokens : conserver access, refresh, `expiresAt`, `refreshedAt`, `refreshExpiresAtEstimate`, `generation`, `state: ready|refreshing|reauth_required`. `expires_in` valide prime ; sinon échéance conservatrice documentée issue de la durée EBP. L'expiration refresh calculée reste **estimée**, révocation possible avant.
- Les claims décodés servent uniquement à l'affichage local, avec mention non vérifiés ; aucune autorisation ni choix de dossier basé sur eux. Ne pas exiger un `id_token` non garanti par les exemples. Si utilisé ultérieurement comme identité vérifiée, validation OIDC complète requise.
- Avant envoi métier, refresh si expiration à moins de 60 s. Sous lock interprocessus auth, **relire** le store : si une autre génération est déjà fraîche, la réutiliser. Sinon persister `refreshing` puis effectuer un seul échange ; persister `ready` et la nouvelle génération avant de débloquer les consommateurs.
- Timeout, coupure, crash, réponse token malformée ou échec de persistance après envoi : `reauth_required`. Un store resté `refreshing` n'autorise pas à rejouer l'ancien refresh token. Après `invalid_grant`, login requis. Ne pas appliquer les retries GET au token endpoint.
- Sur 401 métier : au plus un rejeu ; sous lock vérifier si une génération plus récente existe avant d'effectuer un refresh. Un second 401 devient `AUTH_REQUIRED`. 403 ne déclenche aucun refresh.
- `login`, `logout` et refresh partagent le lock ; ne pas garder le lock pendant l'attente navigateur. Login réserve une génération, puis commit sous lock seulement si la génération n'a pas été invalidée entre-temps (logout ou autre login).
- Locks : hôte local seulement ; processus propriétaire identifiable, attente bornée par deadline, pas de suppression du lock d'un processus vivant sur simple ancienneté. Après crash prouvé, récupération du lock et inspection de l'état durable. Pas de prise en charge NFS/multi-hôtes en v0.1.

## 4. HTTP, quota et limites

Une requête est construite à partir d'un identifiant de route typé + segments validés + query encodée. Origines EBP fixes selon environnement ; hôte identité séparé. Liste blanche de couples méthode/route **même pour GET**. Pas d'URL libre, de proxy arbitraire ni de redirection HTTP suivie avec credentials. Les routes non implémentées sont refusées avant réseau. Token POST accepté uniquement sur l'hôte identité ; aucun export en v0.1. Le flag `EBP_ALLOW_WRITE` n'ouvre rien en v0.1.

Admission métier partagée par groupe de quota : sous lock, relire compteur et dernier départ ; attendre au moins 1000 ms entre deux départs réels, réserver un appel journalier et persister avant envoi. Ne pas réserver une série d'instants puis laisser partir les requêtes en rafale après un réveil tardif. Un crash après réservation consomme conservativement la réservation. Changement de jour calculé dans le fuseau du groupe ; heure reculant = pas de réinitialisation anticipée. Verrou quota jamais détenu pendant refresh ou durée de réponse réseau ; valider le token avant admission et revalider après une longue attente.

Le compteur mesure les tentatives locales, y compris 401, 429, retries, timeouts après départ. Les appels externes d'autres applications ne sont pas observés. `quota_jour_restant` = max(0, plafond − consommé local), `quota_utilisable` = max(0, restant − réserve), `quota_estime: true`. Réserve atteinte : aucun départ supplémentaire. Les appels auth ont un compteur séparé et ne décrémentent pas le compteur métier tant que leur inclusion dans le quota EBP n'est pas établie.

Paramètres d'exécution fixes v0.1 : budget 30 tentatives HTTP au total par outil (auth et retry inclus), deadline 60 s depuis réception, timeout d'une requête 15 s limité par le temps restant ; ressources soumises aux mêmes limites. Une réponse cachée coûte zéro. Pas d'annonce « 30 requêtes = 30 secondes garanties ».

GET : maximum **3 tentatives au total**, y compris rejeu 401. Retenter uniquement 429, 502, 503, 504 et erreurs réseau transitoires. Backoff 1 s puis 2 s ; `Retry-After` valide (secondes ou date HTTP) impose une attente au moins égale, commune au groupe pour 429. Si budget/deadline insuffisant, arrêter. 400/403/404 et schéma inattendu ne sont pas retentés. Réponse JSON plafonnée à 5 Mio, corps d'erreur jamais réémis brut.

Ordre : validation entrée → capture contexte → capacités → cache → préparation token → admission quota/budget → transport → validation EBP → mapping → politique de sortie. Annulation : retirer les attentes en file, aborter le fetch et ne jamais lancer de nouvelle tentative.

## 5. Types, cache, pagination et résultat

Conventions : clés JSON ASCII en snake_case (`numero`, `libelle`, `telephone`, `debit`, `credit`, `echeance`). IDs et comptes restent des chaînes ; ne pas retirer zéros ou suffixes, ni compléter un compte court par des zéros. Champ métier inconnu = `null`, jamais 0/false inventé. Ajouter `id` à `LigneEcriture`, distinct de `ecriture_id`. Enum inconnu : `inconnu` + avertissement avec valeur d'origine ; donnée nécessaire au routage inconnue = `UNSUPPORTED_CAPABILITY`.

Montants : chaînes décimales canoniques (`"1287.50"`), bibliothèque décimale pour sommes et soustractions. Parser les lexèmes numériques EBP sans conversion préalable en flottant lorsque la précision compte. Prix unitaires/taux conservent leur précision utile. Pour affichage des totaux en EUR : deux décimales, arrondi half-up une fois en fin de calcul ; pour une autre devise, échelle documentée ou pas d'arrondi supposé. Agrégations par devise, aucune conversion de change. Sans preuve/config de devise, `devise: null` et avertissement ; ne pas additionner des devises inconnues en prétendant un total monétaire fiable.

Dates : `YYYY-MM-DD` strictes et réellement valides, intervalles inclusifs, `du <= au`. Calcul en jours civils, indépendant du passage heure d'été. Aujourd'hui = Europe/Paris pour v0.1, horloge injectable. Absence de dates = toutes les données accessibles sous budget. Champs `du`/`au` ne prennent pas des timestamps ambigus.

Cache mémoire : référentiels 1 h, transactionnel 60 s ; capacité totale 32 Mio, éviction LRU. Clé = identité/génération, env, famille, dossier ID, route, filtres/tri/projection normalisés. Ne pas mettre en cache erreurs ou pages invalides. Les réponses finales passent toujours par la politique PII, même en cache. Reprise d'un curseur garde une vue locale partielle : pas de garantie de snapshot EBP.

Toute liste accepte `limite` (défaut 50, entier 1..500) et `curseur?`. Page EBP ≤100. Une réponse liste renvoie jusqu'à `limite` **résultats filtrés**, éventuellement après plusieurs pages. `total` vaut null tant que le nombre filtré exact n'est pas connu ; `total_source` peut porter le total non filtré d'EBP. `renvoyes` = longueur du tableau de cet appel. Ne pas arrêter parce qu'une page ne contient aucun match. Fin = indicateur fournisseur fiable ou page vide selon le contrat de cette route ; compteur qui n'avance pas ou page répétée = `UPSTREAM_PAGINATION_INVALID`.

Curseur opaque aléatoire, état **mémoire de session**, expiration 15 minutes, maximum 100 états et 32 Mio cumulés. Il lie outil, identité/génération, dossier, filtres, tri et limite ; conserve position distante, éléments non encore rendus d'une page et IDs déjà vus. Entrées de reprise identiques ; divergence → `CURSOR_MISMATCH`. État absent/redémarrage/éviction → `CURSOR_EXPIRED`, action recommencer ; jamais de redémarrage silencieux à l'offset zéro. Si limite mémoire atteinte, résultat partiel avec raison `cursor_capacity`, sans promesse de reprise. Un seul consommateur par curseur ; usage concurrent = `CURSOR_BUSY` ; un curseur consommé ne redonne pas silencieusement une seconde page différente.

`hasMore: true` = parcours non terminé, même si le nombre de matchs futurs est inconnu. Une liste paginée normalement n'est pas approximative du seul fait de la pagination. Budget, réserve quota, deadline ou limitation intrinsèque de source ⇒ `approximatif: true`, `completude: partielle`, avertissement et raison. Aucune extrapolation des agrégats. En v0.1 les agrégats ne sont pas reprenables : `pagination: null`, totaux calculés seulement sur les lignes parcourues, nombre de lignes parcourues et avertissement dans le résultat ; pour compléter, réduire la période ou le périmètre et relancer. Ne pas sommer automatiquement plusieurs résultats partiels issus de scans susceptibles de se recouvrir. Auth/droits/schéma invalide/serveur durablement en panne ⇒ erreur, jamais succès vide ou simple approximation. Une erreur après des pages valides peut joindre un `partiel` explicitement inutilisable comme total exhaustif.

Enveloppe métier commune :

```json
{
  "dossier": "demo-gc",
  "resultats": [],
  "pagination": {"renvoyes": 0, "total": null, "total_source": 5000, "hasMore": true, "curseur": "opaque"},
  "meta": {
    "appels_api": 30, "appels_auth": 0, "duree_ms": 31000,
    "quota_jour_restant": 9400, "quota_utilisable": 8900, "quota_estime": true,
    "approximatif": true, "completude": "partielle", "raison_arret": "budget",
    "sources": ["hubbix-gescom:/sale-documents"], "avertissements": ["Budget atteint"],
    "mode": "mock", "observe_a": "2026-10-06T12:00:00Z"
  }
}
```

`appels_api` compte le métier ; `appels_auth` l'identité ; leur somme consomme le budget. `mode` = mock ou live, jamais implicite. `completude` = `complete|page|partielle`. `raison_arret` = null, `limite`, `budget`, `quota`, `deadline`, `source_incomplete`, `cursor_capacity`. Pour une fiche, un contexte ou un agrégat : tableau `resultats` de 0 ou 1 objet, `pagination: null`. `dossier: null` pour les outils de contexte globaux. Meta quota null quand aucun groupe n'est ciblé ; `ebp_statut` détaille les groupes dans son objet résultat.

Erreurs stables : `INVALID_ARGUMENT`, `CONFIG_INVALID`, `DOSSIER_REQUIRED`, `DOSSIER_UNKNOWN`, `UNSUPPORTED_CAPABILITY`, `AUTH_REQUIRED`, `AUTH_STORAGE_FAILED`, `PERMISSION_DENIED`, `NOT_FOUND`, `AMBIGUOUS_REFERENCE`, `RESOLUTION_INCOMPLETE`, `CURSOR_MISMATCH`, `CURSOR_EXPIRED`, `CURSOR_BUSY`, `UPSTREAM_UNAVAILABLE`, `UPSTREAM_SCHEMA_CHANGED`, `UPSTREAM_PAGINATION_INVALID`, `RESPONSE_TOO_LARGE`, `PII_POLICY`. Corps `{code,message,action,details?}` sans stack, URL sensible, contenu métier brut ni secret. Les arrêts attendus de budget/quota/deadline d'une liste utilisent l'enveloppe partielle. Pour une fiche non obtenue faute de budget : `RESOLUTION_INCOMPLETE` avec raison, pas `NOT_FOUND`.

## 6. Outils exacts de v0.1

Toutes les entrées sont des objets stricts ; inconnus rejetés. Tous les outils métier acceptent `dossier?` et `inclure_brut?: boolean=false` ; listes acceptent limite/curseur définis ci-dessus. Une entrée optionnelle absente n'implique pas un filtre caché. FR pour le nom, descriptions FR/EN. CPT = Compta, GC = GesCom.

| Outil | Entrées spécifiques | Capacités v0.1 / résultat |
|---|---|---|
| `ebp_lister_dossiers` | aucune | Dossiers configurés de l'env actif, capacités avec motifs et statut de validation ; 0 réseau |
| `ebp_choisir_dossier` | `dossier` requis | Nouveau contexte de session ; 0 réseau |
| `ebp_statut` | aucune | Auth estimée, env, mode, quota par groupe ; 0 réseau |
| `rechercher_tiers` | `texte?`, `type?: client|prospect|fournisseur`, `actif?` | CPT uniquement ; filtres locaux si correspondance API non prouvée ; aucun rapprochement GC |
| `fiche_tiers` | exactement un de `id` ou `code` | CPT : code = numéro direct, UUID résolu par recherche bornée ; GC : ID direct, code non supporté en v0.1 |
| `rechercher_articles` | `texte?`, `type?: bien|service`, `actif?`, `avec_stock?: false` | GC ; true pour stock = capacité non supportée |
| `fiche_article` | `reference?: {id,type: bien|service}` ou `code`, exclusifs | GC ; code résolu par liste, type fourni par résultat, puis détail |
| `lister_documents_vente` | `types?[]`, `statut?: provisoire|valide|facture`, `du?`, `au?`, `tiers?` (ID exact), `texte?` | GC ; enum types parmi ceux de 04, types non supportés refusés avant réseau ; enrichissement si filtre tiers |
| `detail_document` | `reference?: {id,type,statut}` ou `numero`, exclusifs ; `avec_lignes?: true` | GC ; référence route directement ; numéro exige recherche bornée et unicité |
| `echeancier_clients` | `du?`, `au?`, `tiers?` (ID), `en_retard_seulement?: false` | GC ; dates de l'échéance ; pas de reconstitution CPT |
| `lister_reglements` | `du?`, `au?`, `tiers?`, `non_affectes?: false` | GC ; tiers ID refusé tant que la source ne le fournit pas ; résultat conserve nom connu, ID null |
| `lister_ecritures` | `du?`, `au?`, `journaux?[]`, `compte?`, `compte_tiers?`, `texte?`, `validees?`, `lettrees?` | CPT ; renvoie des **lignes**, pas des écritures complètes ; comptes exacts, aucun préfixe implicite |
| `detail_ecriture` | `id` UUID | CPT ; écriture et lignes complètes |
| `transactions_bancaires` | `du`, `au`, `compte?` exact, `statut?` | CPT ; statut filtrable uniquement si enum prouvée ; sinon rejeter filtre, conserver code source en sortie |
| `balance_comptes` | `du`, `au`, `classe?` (un chiffre), `comptes?[]` | CPT ; classe/comptes exclusifs ; agrégat des mouvements, sans solde d'ouverture implicite |
| `grand_livre` | `compte`, `du`, `au` | CPT ; liste des lignes du compte, pas de cumul prétendu depuis l'origine |
| `exercices` | aucune | CPT ; résultat `exercices[]` issu des paramètres dossier |

Règles de résolution : numéro/code non unique = `AMBIGUOUS_REFERENCE` ; aucune correspondance après scan complet = `NOT_FOUND` ; scan interrompu = `RESOLUTION_INCOMPLETE`, même s'il n'a trouvé qu'un candidat. Ne pas utiliser une égalité de noms comme égalité de tiers. Type/statut obligatoire dans une référence document ; pas de fallback vers l'autre endpoint de détail après 404.

Filtrage : texte = recherche insensible à la casse sur les champs nom/code/numéro/libellé pertinents, normalisation Unicode NFC, pas de suppression arbitraire d'accents. `filter.query` EBP ne remplace ce contrat que si sa sémantique a été démontrée ; sinon scan et filtre local sous budget. Tri v0.1 : ordre de la source déclaré, pas de promesse d'ordre global différent sans tri prouvé. Optimisation d'arrêt sur dates désactivée tant que le tri descendant et sa stabilité ne sont pas démontrés. Ne pas envoyer de paramètres conjecturaux (category, préfixe compte, statut bancaire).

Ressources v0.1 : `ebp://dossiers`, `ebp://glossaire`, `ebp://{dossier}/exercices`, `/journaux`, `/plan-comptable` (CPT), `/taux-tva` (CPT/GC). JSON textuel, mêmes limites/PII/cache. Pour une ressource volumineuse, première page 100 max avec complétude et orientation vers un outil si une continuation existe ; ne pas mettre un curseur d'outil inexploitable dans une ressource. Pas de pagination de `resources/list` confondue avec celle du contenu. Les autres ressources et prompts de 04 sont différés.

Catalogue v1 restant : factures impayées, balance âgée, encours, CA, indicateurs, transformation, achats, SaaS, experts, exports et prompts restent dans le backlog T15–T23. Les outils non livrés ne figurent pas dans `tools/list`. Un outil livré mais indisponible sur un dossier retourne une erreur de capacité sans requête EBP. Aucune case 🟡 de 04 n'est une autorisation d'inventer un mapping.

## 7. MCP, confidentialité et sortie

Succès outil : `structuredContent` = enveloppe, `content` = un bloc texte contenant la même enveloppe JSON, `isError: false`. Schéma de sortie validé, y compris variante d'erreur si exposée en structuredContent. Échec métier : `isError: true` et erreur structurée ; erreur JSON-RPC réservée aux appels protocolairement invalides, selon SDK. Déclarer `readOnlyHint: true`, `destructiveHint: false`, `openWorldHint: true` pour lectures EBP ; sélection de dossier décrite comme mutation locale de contexte et annotations adaptées. Les annotations ne remplacent pas le guard HTTP.

PII : mode explicite `EBP_REDACT_PII=true` masque emails, téléphones, IBAN et claims associés sur **tous** les canaux. Il ne promet pas une anonymisation générale des noms, adresses ou texte libre. Les schémas de sortie permettent le masquage sans échec de validation. Utiliser `null` pour les champs email/telephone/IBAN masqués et indiquer les chemins masqués dans les avertissements ; ne pas injecter une chaîne invalide dans un champ au format email. Mode brut interdit dans ce mode (`PII_POLICY`), même depuis cache. Sinon brut seulement pour les objets effectivement rendus, sans headers ou données auth ; mêmes plafonds de taille, pas la totalité des pages scannées. Si la taille dépasse 1 Mio, omettre le brut avec avertissement ; si les données normalisées dépassent 1 Mio, couper la liste et conserver le reste dans le curseur. Fiche unique trop volumineuse : `RESPONSE_TOO_LARGE`, jamais troncature invisible de ses lignes.

Logger uniquement ID requête, identifiant de route, statut, durée, compteurs ; pas de bodies, query, contacts, labels, tokens, `code`, verifier, state, client secret, subscription key ni ID token. Messages EBP nettoyés puis remplacés par une erreur générique si doute. Toutes les données EBP sont non fiables ; aucun champ ne devient instruction de prompt ou sélection d'URL.

## 8. Calculs métier et décisions différées

Les formules ci-dessous sont des choix explicites à tester. Elles ne prouvent pas l'adéquation de chaque champ EBP.

- Échéance GC : `jours_retard = max(0, aujourd'hui − date_echeance)` en jours civils ; `en_retard = reste_du > 0 && date_echeance < aujourd'hui`. Aujourd'hui n'est pas en retard ; date absente ⇒ deux champs null + avertissement. Un paiement positif n'est pas une facture. Ne pas sommer montant d'origine et restant.
- Balance de mouvements CPT : par compte, total débit D, crédit C, `solde = D − C`, `solde_debiteur = max(solde,0)`, `solde_crediteur = max(-solde,0)`. Sans filtre `validees`, inclure tous les statuts retournés et préciser ce périmètre. Pas de bilan ni d'affirmation « comptes équilibrés » sur scan partiel ou sous-ensemble de comptes. Exemple D=150, C=40 ⇒ solde=110. Pas de somme de soldes absolus.
- Factures impayées GC (lot ultérieur) : échéances à reste positif regroupées par ID de document, chaque échéance comptée une seule fois ; pas de jointure par numéro seul. `retard_min_jours=0` inclut les impayés non échus, >0 uniquement retards au seuil ; expliciter les acomptes/avoirs dans le périmètre retenu.
- Balance âgée (ultérieure) : situation courante seulement avant preuve des affectations historiques. Tranches non échues, retard 1–30, 31–60, 61–90, >90 ; échéance du jour dans non échues. Tranches personnalisées doivent couvrir sans chevauchement les retards positifs. Date passée refusée sans historique fiable.
- CA (ultérieur) : aucune addition d'acomptes par défaut. Normaliser la contribution d'un avoir **une fois** en négatif selon mapping testé, puis sommer les contributions signées des factures/avoirs validés. Ex. facture HT 100, avoir HT −20 ⇒ 80, jamais 120. Établir le traitement des factures finales/acompte, avoirs d'acompte, annulations et documents incomplets avec preuves avant activation. En attendant, exposer au besoin un total de documents avec son périmètre, pas le qualifier de CA.
- Comparaison N−1 : décaler les bornes d'un an, rabattre le 29 février au 28 ; comparatif avec période de référence nulle ⇒ variation relative null. CA par article/client exige identifiants et lignes fiables ; total partiel annoncé. CPT 70x : aucun filtre de préfixe présumé ; normalisation comptes et inclure/exclure écritures de clôture à spécifier avant activation.
- Transformation devis : formule cohorte sur devis datés dans la période, taux = transformés / total ; total zéro ⇒ taux null. Dashboard sans période connu inutilisable comme preuve de cette cohorte. Statut « facturé » ne fournit pas une date de transformation.
- SaaS : fenêtre inclusive `Duration = jours(au − du) + 1`, `ToDate = au`. Contrôler `du <= date <= au` côté MCP aussi : une différence de dates négative pourrait inclure le futur. Colonnes, statut, droits `hasRight`, monnaie, jointures et tables nécessitent preuves par famille. `hasRight=false` ⇒ valeur absente, pas de réexposition via brut.

## 9. Contrats v0.2/v0.3 à compléter avant code

GenericQuery : liste explicite de tables par famille, aucune expansion de jokers/ellipsis de 02 ; colonnes autorisées par schéma vérifié. AST filtres proposé `{and:[...]}`, `{or:[...]}` ou feuille `{colonne,operateur,valeur}` ; opérateurs finis, types/arité contrôlés, profondeur 5, 50 feuilles max. Pas de SQL/YAML libre, ni expression `Column` en entrée publique. Sérialiseur YAML de bibliothèque puis encodage query, jamais concaténation. `OrderByValue` stable avec clé unique prouvée ; absence de schéma = capacité désactivée. T18 fixe les signatures finales avant T19.

Exports : ajout d'une variante d'entrée `{export_id}` exclusive des paramètres de création pour reprise. Une seule création POST ; aucune relance automatique après réponse perdue/timeout. Polling GET sous quota/budget/deadline communs ; état connu non terminal ⇒ retour de l'ID existant. États d'erreur terminaux explicites. Référence liée à identité/env/dossier et vérifiée sur reprise ; stockage des seuls IDs techniques autorisé. Taille PDF max proposée 10 Mio, MIME validé, mémoire seulement, ressource MCP liée à la session avec expiration ; pas de path arbitraire sur disque. Mode PII = export binaire refusé. T20 précise les corps exacts, la persistance de reprise et les annotations liées au job distant avant implémentation.
