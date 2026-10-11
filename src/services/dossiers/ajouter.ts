import { lireInformationDomaine } from "../../adapters/compta/domaine.js";
import { listerTauxTva } from "../../adapters/hubbix-gescom/tva.js";
import type { Famille } from "../../domain/capabilities.js";
import type { Dossier } from "../../config/dossiers.js";
import { modifierConfig } from "../../config/ecriture.js";
import { estGuid, estIdentifiant, type Identifiant } from "../../config/identifiers.js";
import type { DossierConfigureBrut } from "../../config/schema.js";
import type { Budget } from "../../http/budget.js";
import type { ContexteHttp } from "../../http/client.js";
import { erreurArgumentInvalideService } from "../commun/erreurs.js";
import { construireDepsEcriture, profilCible, type ContexteDossiers, type DepsDossiers } from "./types.js";

/** Budget dédié à l'appel de validation distante d'un ajout de dossier (07 §4 : 30 tentatives). */
const BUDGET_VALIDATION_DOSSIER = 30;

export interface EntreeAjouterDossier {
  readonly famille: Famille;
  readonly id: string;
  readonly alias: string;
  readonly nom?: string | null;
}

/**
 * Contrôles locaux sans réseau (issue GOU-372, étape 1) : alias conforme et unique dans
 * l'environnement, famille activée pour le profil, GUID syntaxiquement valide, dossier pas déjà
 * déclaré pour cette famille dans cet environnement. Lève avant tout accès réseau ou verrou.
 */
function validerEntreeAjout(entree: EntreeAjouterDossier, ctx: ContexteDossiers): void {
  if (!estIdentifiant(entree.alias)) {
    throw erreurArgumentInvalideService("Alias de dossier invalide.", { alias: entree.alias });
  }
  if (!ctx.famillesActives.includes(entree.famille)) {
    throw erreurArgumentInvalideService(`Famille "${entree.famille}" non activée pour ce profil.`, {
      famille: entree.famille,
    });
  }
  if (!estGuid(entree.id)) {
    throw erreurArgumentInvalideService("Identifiant de dossier invalide : GUID attendu.", { id: entree.id });
  }
  const liste = ctx.dossiers[ctx.environnement];
  if (liste.some((d) => d.alias === entree.alias)) {
    throw erreurArgumentInvalideService(`Alias "${entree.alias}" déjà utilisé dans cet environnement.`, {
      alias: entree.alias,
    });
  }
  if (liste.some((d) => d.famille === entree.famille && d.id.toLowerCase() === entree.id.toLowerCase())) {
    throw erreurArgumentInvalideService(
      "Ce dossier est déjà déclaré pour cette famille dans cet environnement.",
      { id: entree.id, famille: entree.famille },
    );
  }
}

function creerBudgetValidation(ctx: ContexteDossiers): Budget {
  const budget: Budget = {
    restant: BUDGET_VALIDATION_DOSSIER,
    deadline: ctx.deadline,
    ...(ctx.signal !== undefined ? { signal: ctx.signal } : {}),
    consommer(n: number): void {
      budget.restant -= n;
    },
  };
  return budget;
}

/**
 * Un seul appel de lecture par le client HTTP contrôlé (issue GOU-372, étape 2) :
 * `cpt-domain-information` pour Compta, `gc-vat-rates` pour GesCom (03 §réf), en réutilisant les
 * adapters existants (T09/T10) — aucun fetch direct. `dossierId` du contexte HTTP porte le
 * candidat à valider, jamais un dossier déjà configuré.
 */
async function validerDistant(deps: DepsDossiers, ctx: ContexteDossiers, famille: Famille, id: string): Promise<void> {
  const abonnement = ctx.abonnementPourFamille(famille);
  const budget = creerBudgetValidation(ctx);
  const contexteHttp: ContexteHttp = {
    environnement: ctx.environnement,
    famille,
    dossierId: id,
    subscriptionKey: abonnement.cle,
    groupeQuota: abonnement.groupeQuota,
  };
  if (famille === "hubbix-compta") {
    await lireInformationDomaine(deps.http, budget, contexteHttp);
  } else {
    await listerTauxTva(deps.http, budget, contexteHttp);
  }
}

function versDossierConfigureBrut(entree: EntreeAjouterDossier): DossierConfigureBrut {
  const nom = entree.nom ?? null;
  return entree.famille === "hubbix-compta"
    ? { alias: entree.alias, famille: entree.famille, nom, tenantId: entree.id }
    : { alias: entree.alias, famille: entree.famille, nom, domainId: entree.id };
}

/**
 * `dossiers add` (07 §2, issue GOU-372) : validation distante d'abord (un seul appel, lecture
 * seule), persistance atomique ensuite via `modifierConfig`. Si l'appel échoue, rien n'est
 * persisté et l'erreur typée remonte telle quelle (`AUTH_REQUIRED`, `NOT_FOUND`,
 * `UPSTREAM_*`…) ; sinon le dossier est stocké au format du schéma (`tenantId`/`domainId` selon
 * la famille).
 */
export async function ajouterDossier(
  deps: DepsDossiers,
  entree: EntreeAjouterDossier,
  ctx: ContexteDossiers,
): Promise<Dossier> {
  validerEntreeAjout(entree, ctx);
  await validerDistant(deps, ctx, entree.famille, entree.id);

  const nouveauDossier = versDossierConfigureBrut(entree);

  await modifierConfig(
    construireDepsEcriture(deps, ctx),
    ctx.profil,
    ctx.environnement,
    (fichier) => {
      const profilActuel = profilCible(fichier, ctx.profil);
      const listeActuelle = profilActuel.dossiers[ctx.environnement];
      if (listeActuelle.some((d) => d.alias === entree.alias)) {
        throw erreurArgumentInvalideService(`Alias "${entree.alias}" déjà utilisé dans cet environnement.`, {
          alias: entree.alias,
        });
      }
      const idExistant = entree.famille === "hubbix-compta" ? "tenantId" : "domainId";
      if (
        listeActuelle.some(
          (d) => d.famille === entree.famille && (d[idExistant] ?? "").toLowerCase() === entree.id.toLowerCase(),
        )
      ) {
        throw erreurArgumentInvalideService(
          "Ce dossier est déjà déclaré pour cette famille dans cet environnement.",
          { id: entree.id, famille: entree.famille },
        );
      }
      return {
        ...fichier,
        profiles: {
          ...fichier.profiles,
          [ctx.profil]: {
            ...profilActuel,
            dossiers: { ...profilActuel.dossiers, [ctx.environnement]: [...listeActuelle, nouveauDossier] },
          },
        },
      };
    },
  );

  return { alias: entree.alias as Identifiant, famille: entree.famille, id: entree.id, nom: entree.nom ?? null };
}
