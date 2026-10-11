import { modifierConfig } from "../../config/ecriture.js";
import { erreurArgumentInvalideService } from "../commun/erreurs.js";
import { construireDepsEcriture, profilCible, type ContexteDossiers, type DepsDossiers } from "./types.js";

export interface EntreeRetirerDossier {
  readonly alias: string;
}

/**
 * `dossiers remove` (07 §2, issue GOU-372) : aucun appel réseau. Un alias absent donne
 * `INVALID_ARGUMENT` ; retirer le dossier par défaut efface `defaultDossier[environnement]`.
 */
export async function retirerDossier(
  deps: DepsDossiers,
  entree: EntreeRetirerDossier,
  ctx: ContexteDossiers,
): Promise<void> {
  await modifierConfig(
    construireDepsEcriture(deps, ctx),
    ctx.profil,
    ctx.environnement,
    (fichier) => {
      const profilActuel = profilCible(fichier, ctx.profil);
      const listeActuelle = profilActuel.dossiers[ctx.environnement];
      if (!listeActuelle.some((d) => d.alias === entree.alias)) {
        throw erreurArgumentInvalideService(`Alias "${entree.alias}" absent de cet environnement.`, {
          alias: entree.alias,
        });
      }
      const nouvelleListe = listeActuelle.filter((d) => d.alias !== entree.alias);

      const defautActuel = profilActuel.defaultDossier;
      let nouveauDefaut = defautActuel;
      if (defautActuel?.[ctx.environnement] === entree.alias) {
        const copie = { ...defautActuel };
        delete copie[ctx.environnement];
        nouveauDefaut = Object.keys(copie).length > 0 ? copie : undefined;
      }

      return {
        ...fichier,
        profiles: {
          ...fichier.profiles,
          [ctx.profil]: {
            ...profilActuel,
            dossiers: { ...profilActuel.dossiers, [ctx.environnement]: nouvelleListe },
            defaultDossier: nouveauDefaut,
          },
        },
      };
    },
  );
}
