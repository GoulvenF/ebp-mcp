/** Taille maximale d'une page de ressource v0.1 (07 §6, D-T12-13) : pas de continuation. */
export const LIMITE_RESSOURCE = 100;

/** Avertissement exact exigé par D-T12-13 quand une ressource dépasse `LIMITE_RESSOURCE`. */
export const AVERTISSEMENT_RESSOURCE_LIMITEE =
  "ressource limitée aux 100 premiers éléments ; aucune continuation en v0.1";
