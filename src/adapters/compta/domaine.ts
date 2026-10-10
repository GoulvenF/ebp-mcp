import type { z } from "zod";
import type { Budget } from "../../http/budget.js";
import type { ContexteHttp, DependancesClientHttp } from "../../http/client.js";
import { executerRequetePourRoute } from "../../http/client.js";
import { interpreterEnum } from "../../domain/enum.js";
import { InformationDomaineSchema, ParametresDossierSchema } from "../../domain/schemas/compta.js";
import { lireFicheCompta } from "./enveloppe.js";
import { erreurEnveloppeInattendueCompta } from "./errors.js";
import { DomainInformationEbpSchema, FolderSettingsEbpSchema } from "./schemas-ebp.js";

export type InformationDomaine = z.infer<typeof InformationDomaineSchema>;
export type ParametresDossier = z.infer<typeof ParametresDossierSchema>;

const MODES_SAISIE_SOURCE = ["Provisoire", "Validé"] as const;

function mapperModeSaisie(mode: unknown): { mode: ParametresDossier["mode_saisie"]; avertissement: string | null } {
  if (mode === null || mode === undefined) {
    return { mode: null, avertissement: null };
  }
  const resultat = interpreterEnum(mode, MODES_SAISIE_SOURCE);
  if (resultat.valeur === "inconnu") {
    return { mode: "inconnu", avertissement: resultat.avertissement };
  }
  return { mode: resultat.valeur === "Provisoire" ? "provisoire" : "valide", avertissement: null };
}

export interface FicheInformationDomaine {
  readonly resultat: InformationDomaine;
  readonly avertissements: string[];
}

/** `/domain-information` (02 §2) : fiche sans wrapper, ne liste pas les dossiers. */
export async function lireInformationDomaine(
  deps: DependancesClientHttp,
  budget: Budget,
  contexte: ContexteHttp,
): Promise<FicheInformationDomaine> {
  const corps = await executerRequetePourRoute(deps, budget, contexte, "cpt-domain-information");
  const fiche = lireFicheCompta("cpt-domain-information", corps);
  const resultat = DomainInformationEbpSchema.safeParse(fiche);
  if (!resultat.success) {
    throw erreurEnveloppeInattendueCompta("cpt-domain-information");
  }
  const source = resultat.data;
  return {
    resultat: { nom: source.domainName, code: source.domainCode, version: source.version },
    avertissements: [],
  };
}

export interface FicheParametresDossier {
  readonly resultat: ParametresDossier;
  readonly avertissements: string[];
}

/**
 * `/folder-settings` (02 §2) : `exercices[{startDate,endDate,exerciceNumber,closingDate}]` et
 * `entry.mode`. « Longueurs de comptes » et « types de tiers » ne sont pas mappés (T09, voir
 * `ParametresDossierSchema`) faute de nom de champ JSON documenté avec exactitude.
 */
export async function lireParametresDossier(
  deps: DependancesClientHttp,
  budget: Budget,
  contexte: ContexteHttp,
): Promise<FicheParametresDossier> {
  const corps = await executerRequetePourRoute(deps, budget, contexte, "cpt-folder-settings");
  const fiche = lireFicheCompta("cpt-folder-settings", corps);
  const resultat = FolderSettingsEbpSchema.safeParse(fiche);
  if (!resultat.success) {
    throw erreurEnveloppeInattendueCompta("cpt-folder-settings");
  }
  const source = resultat.data;
  const avertissements: string[] = [];
  const { mode, avertissement } = mapperModeSaisie(source.entry?.mode ?? null);
  if (avertissement !== null) avertissements.push(avertissement);
  return {
    resultat: {
      exercices: source.exercices.map((exercice) => ({
        numero: exercice.exerciceNumber,
        date_debut: exercice.startDate,
        date_fin: exercice.endDate,
        date_cloture: exercice.closingDate,
      })),
      mode_saisie: mode,
    },
    avertissements,
  };
}
