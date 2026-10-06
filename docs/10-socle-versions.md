# 10 — Décision de socle : versions figées et bibliothèque décimale

**Décision D09, prise par Lead Tech le 2026-10-06 au titre de T01.** Elle applique D02 (« versions compatibles SDK/Zod figées au démarrage ») et A23 (« versions de dépendances verrouillées ») ; elle ne modifie aucun contrat de [07](07-contrats-v01.md). Toute évolution ultérieure de ces versions passe par une mise à jour de ce document dans le même commit que le changement de `package.json`.

## 1. Versions retenues

| Rôle | Paquet | Version exacte | Plage déclarée dans `package.json` |
|---|---|---|---|
| Runtime | Node.js | 24 LTS (vérifié sur 24.21.0) | `engines.node: "^24.0.0"` |
| Gestionnaire | npm | 11.19.0 | `engines.npm: ">=11"`, `package-lock.json` versionné |
| Compilateur | `typescript` | 7.0.2 | `"7.0.2"` (exact) |
| SDK MCP | `@modelcontextprotocol/sdk` | 1.32.1 | `"1.32.1"` (exact) |
| Schémas | `zod` | 4.6.5 | `"4.6.5"` (exact) |
| Tests | `vitest` | 5.0.3 | `"5.0.3"` (exact) |
| Types runtime | `@types/node` | 24.19.1 | `"24.19.1"` (exact) |
| Décimal | `big.js` | 7.0.1 | `"7.0.1"` (exact) |
| Types décimal | `@types/big.js` | 7.0.0 | `"7.0.0"` (exact) |

Toutes les dépendances directes sont **épinglées à la version exacte**, sans `^` ni `~`, et le lockfile est committé. Motif : A23 et le besoin de reproduire une recette sur un SHA précis. Les montées de version sont des commits explicites, pas un effet de `npm install`.

### Compatibilité SDK / Zod

`@modelcontextprotocol/sdk@1.32.1` déclare `zod` en dépendance et en pair avec `^3.25 || ^4.0`. Zod 4.6.5 est dans cette plage et correspond à la ligne courante : c'est donc **Zod 4** pour tout le projet, une seule copie dans l'arbre. Interdiction d'ajouter une seconde ligne Zod (pas de `zod/v3`), sinon les schémas d'outils MCP et les schémas domaine divergent.

### TypeScript 7

TypeScript 7.0.2 est la version courante. Vérifié sur cet hôte avec `module`/`moduleResolution: nodenext`, ESM, `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `erasableSyntaxOnly`, émission de `.d.ts` et de source maps : compilation propre, erreur de type volontaire détectée, sortie `dist/` importable par Vitest. `@types/node@24.19.1` est retenu plutôt que la ligne 26 pour rester aligné sur le runtime Node 24 déclaré dans `engines`.

## 2. Bibliothèque décimale : `big.js`

### Choix

`big.js@7.0.1`, configurée une seule fois dans `src/domain` :

```ts
Big.DP = 20            // décimales conservées par une division (taux)
Big.RM = Big.roundHalfUp
Big.PE = 1e6           // jamais de notation exponentielle en sortie
Big.NE = -1e6
```

Aucune arithmétique décimale maison, conformément à 07 §1. Les lexèmes EBP sont passés **en chaîne** au constructeur, jamais convertis en `number` au préalable (07 §5).

### Pourquoi

- **Échec bruyant sur entrée invalide.** `new Big('abc')`, `''`, `null` et `NaN` lèvent `[big.js] Invalid number`. C'est la propriété décisive face à la règle « donnée inconnue ≠ zéro » : aucune valeur non interprétable ne peut devenir silencieusement `0`.
- **Surface minimale.** Quatre opérations exactes et comparaisons, sans fonctions transcendantes qui inviteraient à des calculs non exacts dans un contexte comptable.
- **Sortie décimale maîtrisée.** `toFixed(n)` produit la chaîne canonique avec zéros de queue (`"0.30"`, `"80.00"`) ; `PE`/`NE` élargis écartent toute notation exponentielle.
- Zéro dépendance transitive, et maintenue par le même auteur que les alternatives examinées.

### Convention d'arrondi à acter

`Big.roundHalfUp` arrondit **à l'opposé de zéro** à équidistance : `2.345 → "2.35"` et `-2.345 → "-2.35"`. C'est la convention retenue pour les totaux de 07 §5, elle s'applique donc aussi aux avoirs et aux soldes créditeurs. T03 doit la couvrir par un test explicite sur une valeur négative, pas seulement positive.

### Alternatives écartées

| Alternative | Motif du rejet |
|---|---|
| `decimal.js@10.6.0` | Fonctionnellement suffisante, mais surface bien plus large (puissances, racines, logarithmes) sans besoin v0.1 ; configuration `precision` globale plus facile à utiliser à contresens qu'un `DP` limité à la division. |
| `bignumber.js@11.1.5` | Même famille et même auteur, publication plus récente, mais accepte d'autres bases et expose davantage de réglages globaux ; aucun gain mesurable sur les opérations dont 07 a besoin. |
| Arithmétique entière maison (centimes) | Exclue par 07 §1 ; les prix unitaires et taux de 07 §5 conservent une précision supérieure à deux décimales, une échelle fixe les tronquerait. |
| `BigInt` nu | Impose une échelle choisie par chaque appelant ; c'est précisément l'arithmétique maison que le contrat interdit. |

## 3. Preuves de la décision

Vérifications exécutées sur l'hôte de build (Node 24.21.0, npm 11.19.0) avec les versions exactes ci-dessus, sur un projet d'essai jetable hors dépôt :

| Contrôle | Résultat |
|---|---|
| `tsc --noEmit` strict, ESM `nodenext`, sources + tests | succès |
| Erreur de type volontaire (`const x: string = 42`) | détectée, code de sortie 1 |
| `noUncheckedIndexedAccess` effectif (`xs[0]` sur `readonly string[]`) | détecté, code de sortie 1 |
| Build avec `declaration` et source maps | `dist/index.js`, `index.d.ts`, maps produits |
| Test Vitest important le code **compilé** (`../dist/index.js`) | 3 tests passent |
| Import typé de `McpServer` et `StdioServerTransport` du SDK | compile sous `nodenext` avec Zod 4 |
| `0.10 + 0.20` puis `toFixed(2)` | `"0.30"` |
| Lexème `12345678901234567890.123456789` conservé | identique après aller-retour |
| Avoir déjà négatif (`100 + (-20)`) non réinversé | `"80.00"` |
| Entrées `abc`, `''`, `null`, `NaN` | exception, aucune valeur par défaut |

Ces mesures qualifient la combinaison de versions. Elles ne remplacent pas les tests du dépôt : T01 doit reproduire les contrôles de gate dans le projet, et T03 porte le corpus de tests décimaux et calendaires de 07 §5.

## 4. Conséquences pour les lots suivants

- `src/domain` est le seul endroit qui importe `big.js` et configure ses réglages globaux ; les autres couches manipulent des chaînes décimales canoniques ou le type décimal exposé par `domain`.
- Les schémas d'entrée et de sortie MCP et les schémas domaine utilisent la même instance de Zod 4 ; T02 et T03 réutilisent les types de T01 sans les redéfinir.
- La gate commune de 08 (`npm ci`, `npm run typecheck`, `npm test`, `npm run build`) s'appuie sur ces versions ; la CI déclare Node 24 et consomme le lockfile avec `npm ci`.
- Aucun script `prepublish`/`prepublishOnly` publiant : le paquet reste `private` jusqu'à T24.
