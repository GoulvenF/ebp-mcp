/** Familles d'adapters v0.1 (07 §1). */
export type Famille = "compta" | "gescom";

/** Environnement EBP ciblé (07 §2). */
export type Environnement = "prod" | "preprod";

export type StatutCapacite = "disponible" | "indisponible" | "non_supportee";

/** Capacité annoncée par un adapter ou un dossier, avec motif quand elle n'est pas disponible. */
export interface Capacite {
  nom: string;
  statut: StatutCapacite;
  motif?: string;
}
