import { createHash } from "node:crypto";
import { join } from "node:path";
import type { Identifiant } from "../config/identifiers.js";
import { estIdentifiant } from "../config/identifiers.js";
import { erreurGroupeInvalide } from "./errors.js";

/**
 * Valide que `groupe` est un `Identifiant` (07 §2) avant toute construction de chemin ou de nom
 * de verrou : défense en profondeur de T05, indépendante de la validation déjà faite en
 * configuration — un `Identifiant` ne contient que `[a-z0-9_-]`, donc ni séparateur de chemin ni
 * `..`, et ne peut jamais produire de chemin hors du répertoire `quota/` attendu.
 */
export function validerGroupe(groupe: string): Identifiant {
  if (!estIdentifiant(groupe)) {
    throw erreurGroupeInvalide(groupe);
  }
  return groupe;
}

/** `<racine>/quota/<groupe>.json` (07 §4) ; `groupe` déjà validé par {@link validerGroupe}. */
export function cheminEtatQuota(racine: string, groupe: Identifiant): string {
  return join(racine, "quota", `${groupe}.json`);
}

/**
 * Nom de verrou dérivé du groupe, distinct par groupe (07 §4) : deux groupes n'attendent jamais
 * l'un l'autre. Un hachage plutôt qu'un simple préfixe — `quota-<groupe>` dépasserait la longueur
 * maximale des noms de verrou (`RE_IDENTIFIANT_VERROU`, 64 caractères) pour un groupe déjà proche
 * de sa propre longueur maximale (64 caractères, 07 §2).
 */
export function nomVerrouQuota(groupe: Identifiant): string {
  const empreinte = createHash("sha256").update(groupe, "utf8").digest("hex").slice(0, 32);
  return `quota-${empreinte}`;
}
