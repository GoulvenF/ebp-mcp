import type { Famille } from "../../domain/capabilities.js";
import type { ConfigResolue } from "../../config/resolution.js";
import type { Session } from "../../config/session.js";
import { validerEntree } from "../commun/entrees.js";
import { ChoisirDossierContexteEntreeSchema } from "./schemas.js";

export interface ChoisirDossierContexteResultat {
  readonly dossier_actif: string;
  readonly famille: Famille;
  readonly nom: string | null;
}

/**
 * `ebp_choisir_dossier` (D-T12-11, 07 §2/§6) : entrée stricte `{dossier}` requise, validée avant
 * tout (`INVALID_ARGUMENT` sur clé inconnue ou absente). `session.choisir` lève `DOSSIER_UNKNOWN`
 * (`erreurDossierInconnu`, `src/config/errors.ts`) sans sélection de secours et sans modifier la
 * config persistée : l'alias de session en mémoire est le seul état muté, et seulement en cas de
 * succès (`creerSession` ne mute `courant` qu'après avoir validé l'alias).
 */
export function choisirDossierContexte(
  config: ConfigResolue,
  session: Session,
  entreeBrute: unknown,
): ChoisirDossierContexteResultat {
  const entree = validerEntree(ChoisirDossierContexteEntreeSchema, entreeBrute, "ebp_choisir_dossier");

  session.choisir(entree.dossier);

  const liste = config.dossiers[config.environnement];
  const dossier = liste.find((d) => d.alias === entree.dossier);
  if (dossier === undefined) {
    // Inatteignable : `session.choisir` vient de valider cet alias sur la même liste.
    throw new Error(`Dossier "${entree.dossier}" introuvable après sélection de session réussie.`);
  }

  return { dossier_actif: entree.dossier, famille: dossier.famille, nom: dossier.nom };
}
