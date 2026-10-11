import { listerDossiersContexte } from "../../services/contexte/lister-dossiers.js";
import type { ListerDossiersContexteResultat } from "../../services/contexte/lister-dossiers.js";
import { ajouterDossier } from "../../services/dossiers/ajouter.js";
import { retirerDossier } from "../../services/dossiers/retirer.js";
import type { ContexteDossiers, DepsDossiers } from "../../services/dossiers/types.js";
import type { Famille } from "../../domain/capabilities.js";
import { composerContexteCli, ErreurUsageCli } from "../composition.js";
import type { ContexteCli, OptionsCliCommunes } from "../composition.js";
import type { DepsCli } from "../types.js";

/** Budget de temps d'un appel `dossiers add|remove` (07 §4, même borne que les outils métier). */
const DEADLINE_DOSSIERS_MS = 60_000;

function formaterListeHumain(resultat: ListerDossiersContexteResultat): string {
  const lignes: string[] = [];
  lignes.push(`environnement: ${resultat.environnement}`);
  lignes.push(`dossier_actif: ${resultat.dossier_actif ?? "(aucun)"}`);
  lignes.push(`dossier_defaut: ${resultat.dossier_defaut ?? "(aucun)"}`);
  for (const d of resultat.dossiers) {
    lignes.push(`- ${d.alias} (${d.famille}) id=${d.id} actif=${d.famille_active} nom=${d.nom ?? "(aucun)"}`);
  }
  return `${lignes.join("\n")}\n`;
}

async function executerListe(options: OptionsCliCommunes & { readonly json: boolean }, deps: DepsCli): Promise<number> {
  const ctx = await composerContexteCli(options, { env: deps.env, home: deps.home });
  const resultat = listerDossiersContexte(ctx.config, null);
  deps.stdout.write(options.json ? `${JSON.stringify(resultat)}\n` : formaterListeHumain(resultat));
  return 0;
}

function exigerConfigPersistee(ctx: ContexteCli): void {
  if (!ctx.configExiste) {
    throw new ErreurUsageCli(
      "config.json est absent : impossible d'ajouter ou de retirer un dossier sans fichier de configuration persisté (le profil de démonstration en mémoire ne peut pas être modifié).",
    );
  }
}

function construireContexteDossiers(ctx: ContexteCli, signal: AbortSignal): ContexteDossiers {
  const deadline = new Date(ctx.depsPartage.clock.now().getTime() + DEADLINE_DOSSIERS_MS);
  return {
    chemin: ctx.cheminConfig,
    profil: ctx.config.profil,
    environnement: ctx.config.environnement,
    famillesActives: ctx.config.famillesActives,
    dossiers: ctx.config.dossiers,
    abonnementPourFamille: ctx.config.abonnementPourFamille,
    deadline,
    signal,
  };
}

function construireDepsDossiers(ctx: ContexteCli): DepsDossiers {
  return { http: ctx.depsPartage.http, verrous: ctx.verrous, operations: ctx.operations };
}

interface OptionsAjout extends OptionsCliCommunes {
  readonly famille?: string;
  readonly id?: string;
  readonly alias?: string;
  readonly nom?: string;
}

function validerFamille(valeur: string | undefined): Famille {
  if (valeur === undefined) {
    throw new ErreurUsageCli("Option --famille requise pour `dossiers add`.");
  }
  if (valeur !== "hubbix-compta" && valeur !== "hubbix-gescom") {
    throw new ErreurUsageCli(`Option --famille invalide : "${valeur}" (attendu hubbix-compta ou hubbix-gescom).`);
  }
  return valeur;
}

function exiger(valeur: string | undefined, nomOption: string): string {
  if (valeur === undefined) {
    throw new ErreurUsageCli(`Option --${nomOption} requise pour \`dossiers add\`.`);
  }
  return valeur;
}

async function executerAjout(options: OptionsAjout, deps: DepsCli): Promise<number> {
  const famille = validerFamille(options.famille);
  const id = exiger(options.id, "id");
  const alias = exiger(options.alias, "alias");

  const ctx = await composerContexteCli(options, { env: deps.env, home: deps.home });
  exigerConfigPersistee(ctx);

  const dossier = await ajouterDossier(
    construireDepsDossiers(ctx),
    { famille, id, alias, nom: options.nom ?? null },
    construireContexteDossiers(ctx, deps.signal),
  );
  deps.stdout.write(`${JSON.stringify(dossier)}\n`);
  return 0;
}

interface OptionsRetrait extends OptionsCliCommunes {
  readonly alias?: string;
}

async function executerRetrait(options: OptionsRetrait, deps: DepsCli): Promise<number> {
  const alias = exiger(options.alias, "alias");

  const ctx = await composerContexteCli(options, { env: deps.env, home: deps.home });
  exigerConfigPersistee(ctx);

  await retirerDossier(construireDepsDossiers(ctx), { alias }, construireContexteDossiers(ctx, deps.signal));
  return 0;
}

export interface OptionsDossiers extends OptionsAjout, OptionsRetrait {
  readonly json: boolean;
}

export async function executerDossiers(
  sousCommande: "list" | "add" | "remove",
  options: OptionsDossiers,
  deps: DepsCli,
): Promise<number> {
  if (sousCommande === "list") return executerListe(options, deps);
  if (sousCommande === "add") return executerAjout(options, deps);
  return executerRetrait(options, deps);
}
