# 04 — Couche sémantique

> **Relecture du 2026-10-06 :** voir [audit et arbitrages](06-audit.md). Les [contrats précis](07-contrats-v01.md) et le [backlog](08-backlog.md) ont été validés par Goulven le 2026-10-06 et priment sur les formulations générales ci-dessous. Le catalogue v1 ne définit pas à lui seul le contenu de v0.1.

## 1. Principes
1. **Intention métier d'abord** : l'agent demande « factures impayées », pas `GET /sale-commitments`.
2. **Modèle unifié** : mêmes objets quelle que soit la famille d'API ; un *adapter* par famille traduit.
3. **Capacités déclarées** : chaque adapter publie ce qu'il sait faire ; un outil non supporté sur le dossier ciblé renvoie une erreur explicite + l'alternative.
4. **Économie d'appels** (quota 1 req/s, 10 000/jour) : chaque outil a un **budget d'appels**, annonce son coût, et privilégie les endpoints agrégés (dashboards, échéances).
5. **Réponses compactes** : champs utiles par défaut, `inclure_brut: true` pour la réponse EBP ; pagination + `hasMore` ; plafond de lignes.
6. **Montants non ambigus** : `montant_ht`, `montant_ttc`, `devise`, précision conservée ; format décimal exact et arrondi final précisés dans 07 §5.
7. **L'agent n'écrit jamais de syntaxe EBP** : pas de YAML `WhereCondition`, pas de codes d'énumération. Le serveur traduit des filtres structurés.
8. **Nommage FR** (vocabulaire des utilisateurs EBP), descriptions d'outils bilingues FR/EN.

## 2. Architecture
```
Outil MCP ─► Résolution dossier ─► Planificateur (budget, cache) ─► Adapter ─► Client HTTP ─► API EBP
                                                                     │            │
                         hubbix-compta | hubbix-gescom | saas (gescom|batiment)   └─ rate limiter 1 req/s
                                                                                     + compteur journalier
```

### Dossiers & sociétés
- **Dossier** = `{ alias, famille, id, nom }` ; `id` = `FolderId` (SaaS, découvert via `/Folders`) | `tenantId` (Hubbix Compta, déclaré) | `domainId` (Hubbix GesCom, déclaré).
- **Société** (optionnel, config) = regroupement d'un dossier Compta + un dossier GesCom de la même entreprise → ne prouve aucune identité commune des tiers. Pas de fusion ni de remplacement implicite entre APIs (07 §2).
- Chaque outil accepte `dossier` (alias) ; sinon dossier actif de session ; sinon `defaultDossier` de la config.

### Rate limiting & quota
- Proposition : admission **1 req/s** par groupe d’abonnement, partagée entre outils et processus locaux (07 §4).
- **Compteur journalier persistant** (fichier par groupe d’abonnement, reset local à minuit Europe/Paris à confirmer auprès d’EBP) ; `ebp_statut` l'expose.
- `429` → backoff exponentiel (respect de `Retry-After` si présent), 3 essais max.
- **Budget par appel d'outil** : défaut 30 tentatives ; délai distinct de 60 s, voir 07 §4. Si l'estimation dépasse, l'outil renvoie un résultat partiel `approximatif: true` + explication, ou demande de restreindre la période.
- Chaque réponse inclut `meta: { appels_api, duree_ms, quota_jour_restant, approximatif, source }`.

### Cache
- **Mémoire uniquement** (aucune donnée métier sur disque).
- Référentiels (TVA, modes de règlement, journaux, plan comptable, unités, familles, conditions de règlement, `Dependencies`) : TTL 1 h.
- Listes transactionnelles : TTL 60 s (évite les doubles appels dans un même raisonnement d'agent).

## 3. Modèle de domaine

| Objet | Champs normalisés | Hubbix Compta | Hubbix GesCom | SaaS |
|---|---|---|---|---|
| `Tiers` | id, code, nom, type (client/prospect/fournisseur/autre), siret, tva_intra, email, téléphone, adresse, actif, solde_du, solde_echu | `auxiliary-accounts` | `customers/{id}` (`balanceDue`, `pastDueBalance`) — pas de liste | `Clients` (`soldeEchu`), `ExtendedQuery`, GenericQuery `Supplier` |
| `Article` | id, code, libellé, type (bien/service), prix_ht, prix_ttc, taux_tva, unité, actif, stock? | – | `items`, `items/goods|services/{id}` | `ItemsExtentedQuery[/WithTrackingStock]` |
| `DocumentVente` | id, numéro, type, statut, date, tiers{id?,nom}, montant_ht, montant_ttc, net_a_payer, reste_du, statut_compta, lignes? | – | `sale-documents` + détail par type/statut | `SaleDocument[/WithLines]` |
| `DocumentAchat` | idem côté fournisseur | – | – | `PurchaseDocument[/WithLines]` |
| `Echeance` | date, tiers, document, mode_reglement, montant, reste_du, en_retard, jours_retard | lignes non lettrées 411 🟡 | `sale-commitments` | GenericQuery `SaleDocument` (reste dû) 🟡 |
| `Reglement` | code, date, tiers, montant, non_affecte, mode, référence | – | `settlements` | GenericQuery `SaleSettlement` (Gestion) |
| `Compte` | numéro, libellé, nature (général/auxiliaire), classe, actif | `general-account`, `auxiliary-accounts` | – | – |
| `Journal` | code, libellé, type | `journals` | – | – |
| `LigneEcriture` | écriture_id, journal, date, pièce, libellé, compte, compte_tiers, débit, crédit, lettrage, échéance, statut (provisoire/validé) | `lines-entries` | – | – |
| `TransactionBancaire` | date_operation, date_valeur, libellé, montant (signé), compte_bancaire, statut, écriture? | `bank-transactions` | – | – |
| `Affaire` | id, libellé, tiers, état, date, montant 🟡 | – | – | `DealsExtendedQuery` |

**Types de documents unifiés** : `devis`, `commande`, `bon_livraison`, `bon_retour`, `facture`, `avoir`, `facture_acompte`, `avoir_acompte`, `avenant`, `situation`, `devis_etude`.
Mapping : Hubbix GC `SaleDocumentType` (0..4) ; SaaS `DocumentType` (1..11). **Statuts** : `provisoire`, `valide`, `facture` (devis transformé).

## 4. Catalogue d'outils v1 (lecture seule)

Légende de coût : ⚡ 1–2 appels · 🔁 paginé (≤ budget) · 🧮 agrégation côté serveur.

### 4.1 Contexte
| Outil | Entrée | Sortie | Coût |
|---|---|---|---|
| `ebp_lister_dossiers` | – | dossiers SaaS découverts + Hubbix déclarés, famille, capacités, société | ⚡ |
| `ebp_choisir_dossier` | `dossier` | dossier actif de session | 0 |
| `ebp_statut` | – | utilisateur (claims), env, expiration refresh, quota du jour consommé/restant | 0 |

### 4.2 Tiers & articles
| Outil | Entrée | CPT | GC | SaaS | Coût |
|---|---|:-:|:-:|:-:|---|
| `rechercher_tiers` | `texte?`, `type?` (client/prospect/fournisseur), `actif?`, `limite` | ✅ | 🟡¹ | ✅ | ⚡ |
| `fiche_tiers` | `id` \| `code` | ✅ | ✅ | ✅ | ⚡ |
| `rechercher_articles` | `texte?`, `type?`, `actif?`, `avec_stock?`, `limite` | – | ✅ | ✅ | ⚡ |
| `fiche_article` | `id` \| `code` | – | ✅ | ✅ | ⚡ |

¹ Hubbix GesCom n’a **pas de liste clients**. Reconstitution éventuelle à spécifier séparément ; v0.1 proposée : recherche tiers GC non supportée, aucune substitution par Compta (07 §6).

### 4.3 Ventes & achats
| Outil | Entrée | CPT | GC | SaaS | Coût |
|---|---|:-:|:-:|:-:|---|
| `lister_documents_vente` | `types?[]`, `statut?`, `du?`, `au?`, `tiers?`, `texte?`, `limite` | – | ✅² | ✅ | 🔁 |
| `detail_document` | `id` \| `numero`, `avec_lignes` (défaut true) | – | ✅ | ✅ | ⚡ |
| `lister_documents_achat` | `types?[]`, `du?`, `au?`, `fournisseur?`, `limite` | – | – | ✅ | 🔁 |
| `telecharger_document_pdf` | `numero`, `type`, `modele?` | – | – | ✅³ | ⚡ + polling |

² GC : aucun filtre serveur hors `filter.query` → tri `date` décroissant + pagination jusqu'à sortir de la période (arrêt anticipé), filtres type/statut/tiers appliqués côté serveur MCP.
SaaS : `Duration` = (`au` − `du`) en jours civils + 1 pour bornes inclusives, avec filtre de borne supérieure distinct (07 §8), `ToDate` = `au`, `DocumentType` (un appel par type si plusieurs), `WhereCondition` générée pour le tiers.
³ Via Export API (`CreateExport/Pdf`, `kind` = SaleInvoice…, `entityId` = numéro) ; renvoyé en ressource MCP binaire (`application/pdf`). Polling Status toutes les 2 s, timeout 60 s ; sinon renvoie `exportId` pour reprise.

### 4.4 Encaissements & trésorerie
| Outil | Entrée | CPT | GC | SaaS | Coût |
|---|---|:-:|:-:|:-:|---|
| `echeancier_clients` | `du?`, `au?`, `tiers?`, `en_retard_seulement?` | 🟡⁴ | ✅ | 🟡⁵ | 🔁 |
| `factures_impayees` | `retard_min_jours?` (défaut 0), `tiers?`, `regrouper_par_client?` | 🟡⁴ | ✅ | 🟡⁵ | 🔁 🧮 |
| `balance_agee` | `tranches?` (défaut 0-30/31-60/61-90/>90), `date?` | 🟡⁴ | ✅ | 🟡⁵ | 🔁 🧮 |
| `encours_clients` | – | – | ✅ (dashboard) | 🟡 | ⚡ |
| `lister_reglements` | `du?`, `au?`, `tiers?`, `non_affectes?` | – | ✅ | 🟡 (`SaleSettlement`) | 🔁 |
| `transactions_bancaires` | `du`, `au`, `compte?`, `statut?` | ✅ | – | – | 🔁 |

⁴ Cette piste ne suffit pas à reconstituer les impayés : paiements, avoirs et lettrages partiels nécessitent une preuve métier. Capacité désactivée en v0.1 proposée (07 §8).
⁵ SaaS : colonnes de reste dû de `SaleDocument` à identifier (§ checklist 02).

### 4.5 Pilotage
| Outil | Entrée | CPT | GC | SaaS | Coût |
|---|---|:-:|:-:|:-:|---|
| `chiffre_affaires` | `du`, `au`, `regrouper_par?` (mois/client/article), `comparer_n_1?` | 🟡⁶ | ✅ 🧮 | ✅ 🧮 | 🔁 |
| `indicateurs_ventes` | – | – | ✅ (4 dashboards : CA mois, top clients, encours, taux de transformation devis) | – | ⚡×4 |
| `taux_transformation_devis` | `du?`, `au?` | – | ✅ | ✅ 🧮 | ⚡/🔁 |

Calcul CA initial invalidé par A01 : signe des avoirs et rapprochement des acomptes/factures finales à prouver. Règles proposées dans 07 §8 ; ne pas activer un calcul incomplet sous le nom de CA. `regrouper_par=article` nécessite les lignes (coûteux : budget + avertissement).
⁶ Compta : soldes des comptes 70x via `lines-entries` (`generalAccount` préfixe 70) 🟡.

### 4.6 Comptabilité (Hubbix Compta)
| Outil | Entrée | Coût |
|---|---|---|
| `lister_ecritures` | `du?`, `au?`, `journaux?[]`, `compte?`, `compte_tiers?`, `texte?`, `validees?`, `lettrees?`, `limite` | 🔁 |
| `detail_ecriture` | `id` | ⚡ |
| `balance_comptes` | `du`, `au`, `classe?`, `comptes?[]` | 🔁 🧮 |
| `grand_livre` | `compte`, `du`, `au` | 🔁 |
| `exercices` | – | ⚡ (`folder-settings`) |

### 4.7 Outils experts (SaaS)
| Outil | Entrée | Notes |
|---|---|---|
| `ebp_requete` | `table`, `colonnes[]`, `filtres?[]` (`{colonne, operateur, valeur}` combinés en ET/OU), `tri?`, `depuis_modif?`, `limite` (≤ 500) | Traduit en `GenericQuery` + `WhereCondition` YAML ; table validée contre la liste autorisée |
| `ebp_decrire_table` | `table` | Schéma standard vérifié + personnalisations (`CustomFields`) + dépendances ; ne pas supposer CustomFields exhaustif |
| `ebp_export` | `categorie`, `format` (Csv/Pdf), `entite`, `modele?` | Export asynchrone générique |

## 5. Ressources MCP
| URI | Contenu | Famille |
|---|---|---|
| `ebp://dossiers` | Dossiers et capacités | toutes |
| `ebp://{dossier}/plan-comptable` | Comptes généraux | CPT |
| `ebp://{dossier}/journaux` | Journaux | CPT |
| `ebp://{dossier}/exercices` | Exercices comptables | CPT |
| `ebp://{dossier}/taux-tva` | Taux de TVA | toutes |
| `ebp://{dossier}/modes-reglement` | Modes et conditions de règlement | GC, SaaS |
| `ebp://{dossier}/familles` | Familles clients / articles | GC, SaaS |
| `ebp://{dossier}/tables` | Tables GenericQuery autorisées + dépendances | SaaS |
| `ebp://{dossier}/schema/{table}` | Colonnes d'une table | SaaS |
| `ebp://glossaire` | Vocabulaire EBP ↔ modèle unifié, énumérations, types de documents | statique |

## 6. Prompts MCP
| Prompt | But |
|---|---|
| `analyse_impayes` | Balance âgée + priorisation des relances |
| `synthese_ca` | CA de la période vs N-1, top clients/articles, taux de transformation des devis |
| `preparer_relance_client` | Brouillon de relance pour un tiers (aucun envoi) |
| `controle_ecritures` | Écritures provisoires anciennes, comptes d'attente (471), déséquilibres, doublons |
| `revue_tresorerie` | Transactions bancaires non rapprochées + échéances à venir |

## 7. Sortie type d’un outil (illustration initiale, remplacée par 07 §5 après validation)
```json
{
  "dossier": "acme-gc",
  "resultats": [
    { "numero": "FA00000019", "type": "facture", "statut": "valide", "date": "2026-09-12",
      "tiers": { "id": "3", "nom": "KRAP'S" }, "montant_ht": 1287.5, "montant_ttc": 1545.0,
      "reste_du": 545.0, "devise": "EUR" }
  ],
  "pagination": { "renvoyes": 1, "total": 37, "hasMore": true, "curseur": "…" },
  "meta": { "appels_api": 3, "duree_ms": 3120, "quota_jour_restant": 9412,
            "approximatif": false, "source": "hubbix-gescom:/sale-documents" }
}
```

## 8. Évolutions v1.x (écriture)
| Outil | GC | CPT | SaaS |
|---|:-:|:-:|:-:|
| `creer_tiers` / `modifier_tiers` | ✅ | ✅ | via Import |
| `creer_article` | ✅ | – | via Import |
| `creer_devis`, `creer_facture`, `creer_avoir` | ✅ | – | via Import 🟡 |
| `transformer_document` | – | – | ✅ `Documents/Transfert` |
| `passer_ecriture` | – | ✅ `journal-entry` | – |
| `joindre_piece` | – | ✅ | ✅ AddAssociatedFile |

Garde-fous : `EBP_ALLOW_WRITE=true`, `dry_run` par défaut (aperçu complet de la pièce), confirmation explicite, journal d'audit local des écritures.
