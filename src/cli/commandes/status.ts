import { statutContexte } from "../../services/contexte/statut.js";
import type { StatutContexteResultat } from "../../services/contexte/statut.js";
import { composerContexteCli } from "../composition.js";
import type { OptionsCliCommunes } from "../composition.js";
import type { DepsCli } from "../types.js";

function formaterHumain(resultat: StatutContexteResultat): string {
  const lignes: string[] = [];
  lignes.push(`profil: ${resultat.profil}`);
  lignes.push(`environnement: ${resultat.environnement}`);
  lignes.push(`mode: ${resultat.mode}`);
  lignes.push(`dossier_actif: ${resultat.dossier_actif ?? "(aucun)"}`);
  lignes.push(`auth.state: ${resultat.auth.state}`);
  lignes.push(`auth.expiresAt: ${resultat.auth.expiresAt ?? "(aucun)"}`);
  lignes.push(`auth.pkce: ${resultat.auth.pkce}`);
  for (const q of resultat.quota) {
    lignes.push(
      `quota[${q.groupe}]: restant=${q.quota_jour_restant} utilisable=${q.quota_utilisable} estime=${q.quota_estime}`,
    );
  }
  return `${lignes.join("\n")}\n`;
}

/** `ebp-mcp status` (07 §12) : 0 appel réseau, jamais de secret ni de config brute sérialisée. */
export async function executerStatus(options: OptionsCliCommunes & { readonly json: boolean }, deps: DepsCli): Promise<number> {
  const ctx = await composerContexteCli(options, { env: deps.env, home: deps.home });
  const resultat = await statutContexte(
    { tokenStore: ctx.tokenStore, quotaStore: ctx.depsPartage.http.quota, claims: null, tentativesAuth: 0 },
    ctx.config,
    ctx.mode,
    null,
  );
  const sortie = options.json ? `${JSON.stringify(resultat)}\n` : formaterHumain(resultat);
  deps.stdout.write(sortie);
  return 0;
}
