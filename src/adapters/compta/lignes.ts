import { createHash } from "node:crypto";
import { decimalDepuisLexeme } from "../../domain/decimal.js";

/**
 * Montant source CPT (`debit`/`credit`, D-T09-3) : chaîne ⇒ `decimalDepuisLexeme` (jamais
 * `Number`/`parseFloat`). Nombre JSON ⇒ accepté seulement s'il est exploitable sans ambiguïté :
 * `String(n)` conforme à `/^-?\d+(\.\d{1,4})?$/` et partie entière `Number.isSafeInteger`. Sinon
 * `null` + avertissement citant la valeur d'origine — jamais `0` pour une donnée inconnue. Le
 * côté inutilisé d'une ligne banque (`null` source) reste `null`, distinct de `"0"`.
 *
 * Limite documentée : le client T07 a déjà fait `JSON.parse` avant que ce code ne voie la valeur
 * (`src/http/client.ts`) ; un nombre JSON déjà tronqué par la précision IEEE-754 au moment du
 * parse ne peut plus être récupéré ici — seule la forme chaîne garantit une lecture décimale
 * exacte. Voir `docs/09-preuves-et-recette.md` (preuve E07) pour la forme réellement observée.
 */
export function montantDepuisSource(
  valeur: unknown,
  nomChamp: string,
  avertissements: string[],
): string | null {
  if (valeur === null || valeur === undefined) {
    return null;
  }
  if (typeof valeur === "string") {
    const decimal = decimalDepuisLexeme(valeur);
    if (decimal === null) {
      avertissements.push(`Montant illisible (${nomChamp}) : ${JSON.stringify(valeur)}`);
    }
    return decimal;
  }
  if (typeof valeur === "number") {
    if (!Number.isFinite(valeur)) {
      avertissements.push(`Montant numérique non fini (${nomChamp}) : ${JSON.stringify(valeur)}`);
      return null;
    }
    const chaine = String(valeur);
    const exploitable = /^-?\d+(\.\d{1,4})?$/.test(chaine) && Number.isSafeInteger(Math.trunc(valeur));
    if (!exploitable) {
      avertissements.push(
        `Montant numérique non exploitable sans ambiguïté (${nomChamp}) : ${JSON.stringify(valeur)}`,
      );
      return null;
    }
    return decimalDepuisLexeme(chaine);
  }
  avertissements.push(`Montant de type inattendu (${nomChamp}) : ${JSON.stringify(valeur)}`);
  return null;
}

/**
 * Sérialisation JSON canonique (clés triées récursivement) utilisée uniquement pour dériver un
 * identifiant local de ligne (D-T09-2) — jamais pour construire une sortie métier.
 */
function canonicaliser(valeur: unknown): string {
  if (Array.isArray(valeur)) {
    return `[${valeur.map((element) => canonicaliser(element)).join(",")}]`;
  }
  if (typeof valeur === "object" && valeur !== null) {
    const cles = Object.keys(valeur as Record<string, unknown>).sort();
    const paires = cles.map(
      (cle) => `${JSON.stringify(cle)}:${canonicaliser((valeur as Record<string, unknown>)[cle])}`,
    );
    return `{${paires.join(",")}}`;
  }
  return JSON.stringify(valeur);
}

/**
 * `id` de ligne dérivé (D-T09-2) : `local:` + les 16 premiers hex de `sha256` d'un JSON canonique
 * (clés triées) des champs **source** de la ligne tels que reçus, suffixé par le rang
 * d'occurrence parmi les lignes strictement identiques de la même réponse. Déterministe pour un
 * même contenu. **Identifiant local, non une identité EBP** : il ne permet pas de relire la ligne
 * chez EBP, et ne doit jamais être confondu avec `ecriture_id`. Interdits : index de page seul,
 * `compte+rang`, UUID aléatoire, réutilisation de l'UUID d'écriture.
 */
export function idLigneLocale(champsSource: unknown, rangParmiIdentiques: number): string {
  const canonique = canonicaliser(champsSource);
  const empreinte = createHash("sha256").update(canonique, "utf8").digest("hex").slice(0, 16);
  return `local:${empreinte}-${rangParmiIdentiques}`;
}

/**
 * Compteur d'occurrences par signature canonique, à instancier une fois par réponse (D-T09-2) :
 * deux lignes au contenu source strictement identique dans la même page reçoivent des rangs
 * différents (1, 2, …), jamais le même `id`.
 */
export function creerCompteurOccurrences(): (champsSource: unknown) => number {
  const compteurs = new Map<string, number>();
  return (champsSource: unknown): number => {
    const signature = canonicaliser(champsSource);
    const rangPrecedent = compteurs.get(signature) ?? 0;
    const rang = rangPrecedent + 1;
    compteurs.set(signature, rang);
    return rang;
  };
}
