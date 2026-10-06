# 02 — Cartographie des API EBP

> **Relecture du 2026-10-06 :** voir [audit et arbitrages](06-audit.md). Les [contrats précis](07-contrats-v01.md) et le [backlog](08-backlog.md) ont été validés par Goulven le 2026-10-06 et priment sur les formulations générales ci-dessous. Le catalogue v1 ne définit pas à lui seul le contenu de v0.1.

Source principale : documentation officielle publique `https://developpeurs-storage.ebp.com` (analysée intégralement le 2026-10-06).
Légende : ✅ écrit dans la doc · 🟡 déduit / à confirmer sur l'API réelle · ⚠️ incohérence de la doc.

## 1. Environnements & transverse

| Élément | Valeur |
|---|---|
| Production | `https://api-developpeurs.ebp.com/{service}/api/...` ✅ |
| Préproduction | `https://api-developpeurs-preprod.ebp.com/...` ✅ (seuls les exemples Hubbix Compta l'utilisent) |
| Alias APIM | `https://ebp-api-isv.azure-api.net/...` ✅ (vu dans 2 exemples, ne pas utiliser) |
| Identité | `https://api-login.ebp.com/connect/{authorize,token}` ✅ |
| Headers communs | `Authorization: Bearer <jwt>`, `ebp-subscription-key: <clé>` ✅, `Accept-Language` (défaut `fr-FR`) |
| Périmètre | SaaS uniquement — « Ne fonctionne pas sur des applications desktop » ✅ |

### Quotas (FAQ) ✅
- **1 appel / seconde** et **10 000 appels / jour** (phase *Early Adopters*, susceptible d'évoluer).
- **100 éléments max par page** ; au-delà → erreur.
- `429` = limite atteinte.

### Erreurs ✅
Format SaaS : `{ title, message, errorType, errors:[{errorCode, errorMessage}], origin, systemMessage }`.
Format Hubbix GC : `{ status, errorCode, message, data? }` (ex. `CustomerGroup.NotFound`).
Codes : 400 paramètre invalide · 401 JWT invalide · 403 droits insuffisants · 404 dossier/utilisateur inexistant · 429 quota · 500 erreur API.

### Charte d'utilisation ✅ (résumé)
Usage professionnel ; interdiction d'activités concurrentes ou préjudiciables à EBP ; prudence et confidentialité ; le client peut partager ses codes avec son revendeur ; sanctions possibles (limitation, réparation). Compatibilité des CGU applicables à vérifier avant publication.

### Tableau de synthèse des 4 familles

| | Hubbix Compta TPE | Hubbix GesCom TPE | SaaS Gestion | SaaS Bâtiment |
|---|---|---|---|---|
| Préfixe | `/hubbix-cpttpe/api/v1` | `/hubbix-gctpe/api/public/v1` | `/gescom/api/v1` | `/batiment/api/v1` |
| Dossier | header `tenantid` (UUID) | header `DomainId` (GUID) | chemin `Folders/{FolderId}` | idem |
| Découverte des dossiers | ❌ aucune | ❌ aucune | ✅ `GET /Folders` | ✅ `GET /Folders` |
| Pagination | `skip`/`take` → `{data, take, skip, totalRecords}` | `skip`/`take` → `{elements, take, skip, total}` | `Offset`/`Limit` → `{results, paging{offset,limit,total,returned}}` | idem |
| Tri | `sortField` / `sortDirection` | `sortingOrder.property` / `sortingOrder.sortType` (0 asc, 1 desc) | `OrderByValue` | idem |
| Filtre | paramètres dédiés (dates, comptes…) | `filter.query` (plein texte) **uniquement** | paramètres dédiés + `WhereCondition` YAML | idem |
| Schéma des réponses | documenté | documenté | ⚠️ **non documenté** (tables, `Columns` libres) | idem |
| Écriture | oui (tiers, comptes, journaux, saisie) | oui (CRUD clients, articles, devis, factures, avoirs) | quasi nulle (Transfert) → via Import | idem |

---

## 2. Hubbix Comptabilité TPE

Préfixe `/hubbix-cpttpe/api/v1`, header **`tenantid`** (UUID du dossier) obligatoire sur tous les appels.
Dates `YYYY-MM-DD`. Montants en `debit` / `credit` séparés (nombre ; `null` pour le côté inutilisé en banque).

| Endpoint (GET) | Paramètres clés | Réponse |
|---|---|---|
| `/domain-information` | – | `{domainName, domainCode, version}` (ne liste **pas** les dossiers) |
| `/folder-settings` | – | `exercices[{startDate,endDate,exerciceNumber,closingDate…}]`, longueurs de comptes, `entry.mode`, types de tiers |
| `/auxiliary-account-types` | – | catégories de tiers : Clients `C`/411, Fournisseurs `F`/401, Salariés `S`/421, Organismes `O`/437, Autres `A`/467 |
| `/auxiliary-accounts` | `category`🟡, `search`, `isActive`, `numberFrom`, `sortField`, `sortDirection`, `skip`, `take` | `{data:[{uuid,name,number,vatNumber,siret,isActive,types}], totalRecords}` |
| `/auxiliary-accounts/{number}` | ex. `C0000001` | fiche + `contact{…email…}`, `address{…}` |
| `/general-account` ⚠️ singulier | `search`, `isActive`, `isRacine`, `isCollective`, `numberFrom` (int), `classNumber`, `vatRate`, `territoriality`… | `{data:[{uuid,number,label,active,collective,racine}]}` |
| `/general-account/{number}` | ex. `10100000` | détail + `taxType`, `operationType`… |
| `/journals` | `filter`, `order` (syntaxe 🟡 ; opérateurs `^ % !% gte gt lte lt $ lneq`) — **pas de pagination** | `{data:[{uuid,code,name,journalType{name},counterpartAccount…}]}` |
| `/journals/{code}` | ex. `AC` | journal |
| `/lines-entries` | `startDate`, `endDate`, `generalAccount`, `auxiliaryAccount`, `journals`🟡CSV, `valid`, `lettered`, `assigned`, `bankDeposit`, `amount`, `nature`🟡, `search`, tri, `skip`, `take` | ⚠️ wrapper `linesEntries` : `[{entry{journal,date,entryMode,…}, generalAccount, auxiliaryAccount, label, debit, credit, piece, document, deadline, lettering…}]` |
| `/entries/{uuid}` | – | écriture complète avec `lines[]` |
| `/search-entries/entries?uuids=` | liste CSV d'UUID | ⚠️ tableau nu ; comptes courts (`411`) et champ `thirdAccount` |
| `/bank-transactions` | `startDate`, `endDate`, `status` (0/1/2 🟡 sens), `bankAccount(s)`, `sort` (`chronological`/`reverse-chronological`), `withAssignmentSuggestion`, `skip`, `take` | `{data:[{label, account{bankName,iban,balance…}, operationDate, valueDate, debit, credit, reference, status, entry}]}` |
| `/vat-rate` | – | `{data:[{designation, rate, isActive, territoriality}]}` |
| `/pieces-jointes/{uuidMs}` | – | **binaire** (fichier) |

Énumérations : `entryMode` = `Provisoire` \| `Validé` ; `journalType.name` = Achats, Ventes, Trésorerie, Opérations diverses, À Nouveaux.

Écriture (v1.x) : `POST/PUT/PATCH auxiliary-accounts`, `general-account`, `journals`, `PUT folder-settings`, `POST pieces-jointes/add` (multipart), **`POST journal-entry`** (saisie : `entryMode`, `journal`, `linesEdition[]`, `linesDeletion[]`…).

⚠️ Quirks : 3 formes de wrapper (`data`, `linesEntries`, tableau nu) ; numéros de comptes 8 chiffres vs courts ; l'upload renvoie une URL interne `http://api-compta-web.ebp.com/...` à ignorer.

---

## 3. Hubbix Gestion Commerciale TPE

Préfixe `/hubbix-gctpe/api/public/v1`, header **`DomainId`** (GUID) obligatoire.
Liste : `take`, `skip`, `sortingOrder.property`, `sortingOrder.sortType`, `filter.query` → `{take, skip, total, elements[]}`.
Décimaux sérialisés avec ~28 chiffres (`1545.0000000000000000000000000`) : préserver les lexèmes et la précision ; ne pas arrondir les prix unitaires ou calculs intermédiaires (07 §5).

| Endpoint (GET) | Réponse clé |
|---|---|
| `/customers/{IdCustomer}` ⚠️ **pas de liste clients** | `code, name, siret, intracommunityVatNumber, contactsDetail.invoicing{address,contact{email,phone…}}`, **`balanceDue`, `pastDueBalance`**, `customerGroupId`, `settlementTermId` |
| `/customer-groups[/{id}]` | `label, discountRate, settlementTermId` |
| `/items` | `code, label, itemType` (`GoodItem`/`ServiceItem`), `priceVatExcluded`, `priceVatIncluded`, `vatRate`, `itemStatus` |
| `/items/goods/{id}`, `/items/services/{id}` | + `description`, `itemGroupId`, `saleUnitId`, `costPriceAndMargin` |
| `/item-groups[/{id}]` | `label, vatId` |
| **`/sale-documents`** | `id, documentType, documentStatus, name` (client, **sans id**), `date, number, totalAmountVatExcluded, totalAmountVatIncluded, netAmountVatIncluded, **dueAmount**, accountingTransferStatus` — ⚠️ **aucun filtre date/type/client** (seulement `filter.query`) |
| `/sale-invoices/{id}` (provisoire), `/sale-invoices/validated/{id}` | en-tête + `customerId`, `commitments[{date,amount,remainingAmount,paymentModeId}]`, `lines[]`, `footer{…totaux…}`, `vatSummaryLines[]`, `profitability` |
| `/sale-credits/{id}`, `/sale-credits/validated/{id}` | idem facture (montants négatifs) |
| `/sale-quotes/{id}` (provisoire), `/sale-quotes/invoiced/{id}` | idem + `validUntil` |
| `/sale-deposit-invoices/{id}`, `/sale-deposit-credits/{id}` | acomptes : `amountVatIncluded`, `remainingAmount`, `lateAmount`… |
| **`/sale-commitments`** (échéances) | `id` (GUID), `date` (échéance), `customer{id,name,code}`, `document{id,number,documentType,documentStatus}`, `paymentMode` (libellé), `amount`, `remainingAmount` |
| **`/settlements`** (règlements) | `code, date, customerName, amount, stillToBeDistributedAmount, paymentModeLabel, paymentReference, settlementType` |
| `/settlement-terms[/{id}]` | conditions de règlement + `lines[]` |
| `/payment-modes[/{id}]` | `label, paymentModeType, isDefault` |
| `/vat-rates` (tableau nu) | `label, rate, territoriality, isDefault` |
| `/sale-units[/{id}]` | unités |
| `/printing-models`, `/printing-models/names`, `/printing-models/default-name` | modèles d'impression |
| `/dashboards/best-customers-indicator` | `{totalAmount, bestCustomers[{name,totalAmount}]}` (top N selon paramétrage) |
| `/dashboards/commitment-customer-indicator` | `{totalAmount, totalOverdueAmount, totalFallingDueAmount}` ⚠️ descriptions inversées dans la doc |
| `/dashboards/sale-amount-indicator` | décimal en texte brut = CA HT mensuel 🟡 (mois courant ?) |
| `/dashboards/sale-quote-indicator` | `{rate, invoicedSaleQuotesCount, totalSaleQuotesCount}` |

**Les dashboards ne prennent aucun paramètre** (pas de période).

Énumérations ✅ :
- `SaleDocumentType` : SaleInvoice=0, SaleCredit=1, SaleDepositInvoice=2, SaleDepositCredit=3, SaleQuote=4
- `SaleDocumentStatus` : Provisional=0, Validated=1 (= « facturé » pour un devis)
- `AccountingTransferStatus` : SentForAccounting=0, Accounted=1, EntryGenerationFailure=2
- `PaymentMode` : Other=1, Bor=2, CreditCard=3, Check=4, Cesu=5, Cash=6, Paypal=7, Debit=8, Tip=9, Transfer=10
- `SettlementType` : CashReceipt=1, Reimbursement=2 · `ItemStatus` : Active=0, Inactive=1
- `Territoriality` : France=0, Corse=1, Dom=2, ImportExport=3, Intracommunautaire=4, Monaco=5, HorsFrance=6
- `UnitType`, `SettlementTermLineType`, `PrintingModelType`, `SortType` : voir doc.

Routage d'un document : `documentType` + `documentStatus` de `/sale-documents` → endpoint de détail (ex. facture validée → `/sale-invoices/validated/{id}`).

Écriture (v1.x) : POST/PUT/DELETE sur `customers`, `customer-groups`, `items/goods`, `items/services`, `item-groups`, `payment-modes`, `settlement-terms`, `sale-quotes`, `sale-invoices`, `sale-credits` ; POST `sale-deposit-invoices`, `sale-deposit-credits`. Corps en PascalCase. **Pas d'endpoint** de validation de facture ni de saisie de règlement.

⚠️ Quirks : `filer.query` (typo d'un exemple), `sorting.*` vs `sortingOrder.*`, noms de champs des tableaux ≠ JSON (`prixVatExcluded` vs `priceVatExcluded`), `{IdSetllementTerm}`.

---

## 4. SaaS API Gestion & Bâtiment

Préfixes `/gescom/api/v1` et `/batiment/api/v1` — structures documentaires très proches, permettant un adapter commun ; capacités et tables à vérifier séparément, notamment `Country` / `SaleSettlement`.

### Dossiers
`GET /Folders?Offset&Limit` → `{folders:[{id:"3691", name, shortName:"INV40"}], paging}` ✅. Limité aux dossiers de l'utilisateur du JWT. `shortName` identifie le produit (ex. `INV30` = Gestion SaaS Pro).
`GET /maintenance/api/v1/Folders` : même forme, tous produits SaaS 🟡.

### Endpoints de lecture (sous `/Folders/{FolderId}`)

| Endpoint | Paramètres | Remarques |
|---|---|---|
| `Clients` | `TypeClient` (0 tous, 1 client, 2 prospect), `SearchTerm`, `Offset`, `Limit` | Vue « écran » : `code, name, email, phones, clientType`, **`soldeEchu`** (solde échu) ; chaque champ `{value, hasRight}` |
| `Clients/ExtendedQuery[/WithAddress]` | `Columns`, `FromModifiedDate`, `OrderByValue`, `WhereCondition`, `CustomerType`, `CustomerActiveState` (Active 0, InSleeping 1, Blocked 2, PartiallyBlocked 3, NonPayment 4), `FamilyIdIN/NotIN`, `SubFamilyIdIN/NotIN` | Table `Customer` brute |
| `Documents/SaleDocument[/WithLines]` | **`Duration` (jours, obligatoire)**, `ToDate` (défaut now), `DocumentType`, `SysModifiedDate`, `Columns`, `OrderByValue`, `WhereCondition` | Fenêtre : `DATEDIFF(day, DocumentDate, ToDate) < Duration` |
| `Documents/PurchaseDocument[/WithLines]` | idem | |
| `Items/ItemsExtentedQuery[/WithTrackingStock]` ⚠️ orthographe (`Extended` dans un exemple) | familles, `ActiveStateExcluded`, `SysModifiedDate`, `WhereCondition` | Table `Item` (+ stock) |
| `Deals/DealsExtendedQuery[/WithColleagues]` | `Duration`, `ToDate`, `DealStateExcluded` (InStudy 0, Accepted 1, InProgress 2, Received 3, Finished 4, Canceled 5, Other…9) | Affaires |
| `CustomFields` | – | Arbre de schéma `schema[].tables[].columns[]` |
| `GenericQuery` | **`TableName`**, `Columns` (répétable ou CSV ; jointures `Unit.Caption` → clé `Unit_Caption`), `FromModifiedDate`, `OrderByValue` (requis pour paginer), `WhereCondition`, `Offset`, `Limit` | `{results, paging}` |
| `GenericQuery/{id}` | `TableName`, `Columns` | `{result}` |
| `/Dependencies/{TableName}` (hors dossier) | – | `{linkedTables:[…]}` |

`DocumentType` ✅ : Tous 0, Devis 1, Facture 2, DevisEtude 3, Commande 4, Avenant 5, BonLivraison 6, SituationProjet 7, BonRetour 8, Avoir 9, FactureAcompte 10, AvoirAcompte 11.

⚠️ **Les champs des réponses Documents/Items/Deals ne sont pas documentés.** Les noms de colonnes viennent du schéma de l'application (« Exporter le schéma de l'application » dans EBP Gestion web : Mes paramètres → Outils avancés), d’un appel réel ; `CustomFields` décrit les champs personnalisés et ne prouve pas le schéma standard complet. → Tâche dédiée dès l'accès (voir §6).

### Aperçu des tables GenericQuery (non utilisable comme allowlist)
- **Tiers** : Customer, Address, Contact, Supplier, Colleague, Civility, CustomerFamily, CustomerSubFamily, SupplierFamily, GeographicSector, ClassificationGroup, ThirdReference
- **Articles / stock** : Item, ItemFamily, ItemSubFamily, RangeItem, RangeType, RangeTypeElement, LinkedItem, ItemComponent, SupplierItem, StockItem, TrackingStockItem, Storehouse, Unit, UnitType, ItemVatTerritoriality
- **Documents** : SaleDocument, SaleDocumentLine, SaleDocumentLineTrackingDispatch, PurchaseDocument, PurchaseDocumentLine, StockDocument, StockDocumentLine, DocumentSerial, StandardText, Shipping
- **Affaires / SAV / planning** : Deal, DealColleague, ConstructionSite, CustomerProduct, MaintenanceContract, MaintenanceContractCustomerProduct, Incident, Equipment, ScheduleEvent, ScheduleEventType, ScheduleEventCustomerProduct, TravelExpense
- **Référentiels / règlements** : Vat, Ecotax*, PriceList, PriceListCategory, SettlementMode, PaymentType, CurrencyTable, **SaleSettlement** (Gestion) / Country (Bâtiment)
- **Pièces jointes** : *AssociatedFiles (Customer, Item, SaleDocument, PurchaseDocument, Supplier…)
- **Système** : EbpSysOptions, EbpSysGenericImportSettings · tables personnalisées `xx_*`, `xy_*`, `xyx_*`

### WhereCondition (YAML encodé URL) ✅
```yaml
type: ImbricationFilter          # ou CustomFilter
operator: Or                     # And | Or
left:
  type: CustomFilter
  column: Id
  operator: Equal                # In NotIn Like Equal Different Lower LowerOrEqual
                                 # Upper UpperOrEqual IsNull IsNotNull Between
  valueType: String              # String Int Decimal Date Column
  value: ['ANIM0001']
right:
  type: CustomFilter
  column: Id
  operator: Equal
  valueType: String
  value: ['BUZZ0001']
```
→ `WHERE (Id = 'ANIM0001' OR Id = 'BUZZ0001')`. Indentation par espaces. Le serveur MCP doit valider table, colonnes, opérateurs et types ; ne pas supposer que le rejet d’injections côté EBP suffit.
**Opportunité** : le serveur génère ce YAML à partir de filtres structurés (l'agent ne l'écrit jamais à la main).

---

## 5. SaaS Export / Import / Maintenance

**Export** (`/export/api/v1`, asynchrone) ✅
1. `POST CreateExport/{Pdf|Csv}` body `{kind, entityId, folderId, reportId?}` → 202 `{exportId}`
   (`POST CreateConfigurableExport` `{kind, modelName}` pour un modèle paramétré)
2. `GET Status?exportId=` → `status` ∈ Waiting, Starting, Completed, OperationError, EbpOperationException, EbpOpenDataBaseError, EbpOlapiError
3. `GET Result?exportId=` → fichier brut
- ~85 catégories (`kind`) : SaleQuote, SaleOrder, SaleInvoice, SaleCreditMemo, SaleDeliveryOrder, Purchase*, Customer, Supplier, Item, Deal…
- Relance auto par CRON horaire (5 essais) ; **ne pas relancer manuellement** (doublons).
- Usage MCP : **PDF d'une facture/devis** (`entityId` = numéro).

**Import** (`/import/api/v1`) : ~76 catégories, `POST createImport` (multipart) → `StatutResultImport`. Seule vraie voie d'écriture SaaS → v1.x.
**Maintenance** (`/maintenance/api/v1`) : `UnlogAll`, `UnlockAll` → **jamais exposés**.

---

## 6. Points à valider sur l'API réelle (checklist préprod)

- [ ] **Découverte des dossiers Hubbix** (`tenantid`, `DomainId`) : aucune API → claims JWT ? `maintenance/Folders` ? URL de l'appli Hubbix ? Sinon saisie manuelle dans la config.
- [ ] `tenantid` (Compta) et `DomainId` (GesCom) d'une même société : identiques ?
- [ ] Redirect URI : `http://localhost:3333` (tableau) vs `https://localhost:3333/api/login/SigninRedirect` (exemple) — URI exacte autorisée ? PKCE S256 accepté ?
- [ ] Schéma réel des réponses `SaleDocument`, `PurchaseDocument`, `Items…`, `Deals…` (colonnes montants, statut, reste dû, client) → fixtures.
- [ ] Orthographe `ItemsExtentedQuery` vs `ItemsExtendedQuery`.
- [ ] `take` max Hubbix (100 comme SaaS ?).
- [ ] Sens de `status` des transactions bancaires (0/1/2), valeurs de `category` / `nature` (Hubbix Compta).
- [ ] `sale-amount-indicator` : période couverte.
- [ ] Le quota 1 req/s est-il par abonnement ou par utilisateur ? Headers de quota renvoyés (`Retry-After`) ?
- [ ] Télécharger les exemples C# (`POC_alone.7z`, `POC_with_lib_IdentityModel.OIDC.7z`).
