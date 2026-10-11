/**
 * Politique de sortie (D-T12-8, 07 §7) : paramètre du serveur, jamais un état global. Seul
 * `redactPii` pilote `appliquerPolitiqueSortie` ; les autres paramètres de `OptionsExecution`
 * (mode, signal…) n'influencent jamais le masquage.
 */
export interface PolitiqueSortie {
  readonly redactPii: boolean;
}

/** Clés de données masquées par nom, à toute profondeur (D-T12-8) : `claims.email` est un cas de `email`. */
const CLES_PII = new Set(["email", "telephone", "compte_bancaire"]);

/**
 * Motifs email/IBAN/téléphone sur du texte (D-T12-8) : appliqués aux textes produits par le
 * serveur (`message`, `action`, `details`, `avertissements`), qui peuvent citer une entrée ou une
 * valeur source. Volontairement génériques plutôt que liés à un chemin précis : le document
 * d'implémentation ne promet pas une anonymisation générale des noms/adresses/texte libre EBP,
 * mais n'interdit pas non plus qu'un motif reconnu y soit incidemment masqué.
 */
const MOTIF_EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const MOTIF_IBAN = /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g;
const MOTIF_TELEPHONE = /(?:\+33|0)[\s.-]?[1-9](?:[\s.-]?\d{2}){4}/g;

function masquerMotifs(texte: string): string {
  return texte.replace(MOTIF_EMAIL, "[masqué]").replace(MOTIF_IBAN, "[masqué]").replace(MOTIF_TELEPHONE, "[masqué]");
}

function cheminEnfant(chemin: string, cle: string): string {
  return chemin === "" ? cle : `${chemin}.${cle}`;
}

/** Première passe (D-T12-8) : nullifie les clés PII connues à toute profondeur, chemins généralisés sans index. */
function masquerDonnees(valeur: unknown, chemin: string, chemins: Set<string>): unknown {
  if (Array.isArray(valeur)) {
    return valeur.map((element) => masquerDonnees(element, `${chemin}[]`, chemins));
  }
  if (valeur !== null && typeof valeur === "object") {
    const resultat: Record<string, unknown> = {};
    for (const [cle, sousValeur] of Object.entries(valeur as Record<string, unknown>)) {
      const sousChemin = cheminEnfant(chemin, cle);
      if (CLES_PII.has(cle) && sousValeur !== null) {
        resultat[cle] = null;
        chemins.add(sousChemin);
      } else {
        resultat[cle] = masquerDonnees(sousValeur, sousChemin, chemins);
      }
    }
    return resultat;
  }
  return valeur;
}

/** Seconde passe (D-T12-8) : masque les motifs reconnus sur toute chaîne restante de l'arbre. */
function masquerTextes(valeur: unknown): unknown {
  if (typeof valeur === "string") {
    return masquerMotifs(valeur);
  }
  if (Array.isArray(valeur)) {
    return valeur.map(masquerTextes);
  }
  if (valeur !== null && typeof valeur === "object") {
    const resultat: Record<string, unknown> = {};
    for (const [cle, sousValeur] of Object.entries(valeur as Record<string, unknown>)) {
      resultat[cle] = masquerTextes(sousValeur);
    }
    return resultat;
  }
  return valeur;
}

function estEnveloppeAvecMeta(
  valeur: unknown,
): valeur is { meta: { avertissements: string[] } } & Record<string, unknown> {
  if (valeur === null || typeof valeur !== "object") return false;
  const meta = (valeur as Record<string, unknown>)["meta"];
  return (
    meta !== null &&
    typeof meta === "object" &&
    Array.isArray((meta as Record<string, unknown>)["avertissements"])
  );
}

/**
 * Unique point de sortie de tous les canaux (D-T12-8) : enveloppes d'outils, ressources, outils de
 * contexte (claims de `ebp_statut`), erreurs. No-op si `redactPii` est faux. S'applique après le
 * cache, à chaque réponse — le cache et les curseurs gardent des données non masquées en mémoire.
 */
export function appliquerPolitiqueSortie<T>(valeur: T, politique: PolitiqueSortie): T {
  if (!politique.redactPii) {
    return valeur;
  }
  const cheminsMasques = new Set<string>();
  const donneesMasquees = masquerDonnees(valeur, "", cheminsMasques);
  const texteMasque = masquerTextes(donneesMasquees);

  if (cheminsMasques.size === 0) {
    return texteMasque as T;
  }
  const avertissement = `Champs masqués (EBP_REDACT_PII) : ${[...cheminsMasques].sort().join(", ")}`;
  if (estEnveloppeAvecMeta(texteMasque)) {
    return {
      ...texteMasque,
      meta: { ...texteMasque.meta, avertissements: [...texteMasque.meta.avertissements, avertissement] },
    } as T;
  }
  return texteMasque as T;
}
