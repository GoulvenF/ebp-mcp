import type { Environnement } from "../domain/capabilities.js";
import { erreurConfigInvalide } from "./errors.js";
import type { Journal } from "./journal.js";

const VARIABLES_RECONNUES = [
  "EBP_PROFILE",
  "EBP_ENV",
  "EBP_CLIENT_ID",
  "EBP_CLIENT_SECRET",
  "EBP_SUBSCRIPTION_KEY",
  "EBP_REDIRECT_URI",
  "EBP_QUOTA_RESERVE",
  "EBP_REDACT_PII",
] as const;

/** Valeurs des variables `EBP_*` déjà extraites et validées (07 §2), prêtes pour `resoudreConfig`. */
export interface VariablesEnv {
  profile?: string;
  env?: Environnement;
  clientId?: string;
  clientSecret?: string;
  subscriptionKey?: string;
  redirectUri?: string;
  quotaReserve?: number;
  redactPii?: boolean;
}

/**
 * Lit la liste blanche `EBP_*` (07 §2). Une variable reconnue présente mais vide ou blanche ⇒
 * `CONFIG_INVALID` nommant la variable, jamais de repli implicite. Une variable `EBP_*` non
 * reconnue est ignorée avec un avertissement.
 */
export function lireVariablesEnv(env: NodeJS.ProcessEnv, journal: Journal): VariablesEnv {
  for (const cle of Object.keys(env)) {
    if (cle.startsWith("EBP_") && !(VARIABLES_RECONNUES as readonly string[]).includes(cle)) {
      journal.avertir(`Variable d'environnement EBP_* inconnue ignorée : ${cle}`);
    }
  }

  const lireTexte = (nom: string): string | undefined => {
    const valeur = env[nom];
    if (valeur === undefined) return undefined;
    if (valeur.trim() === "") {
      throw erreurConfigInvalide(`La variable ${nom} est présente mais vide ou blanche.`, { variable: nom });
    }
    return valeur;
  };

  const profile = lireTexte("EBP_PROFILE");
  const envTexte = lireTexte("EBP_ENV");
  if (envTexte !== undefined && envTexte !== "prod" && envTexte !== "preprod") {
    throw erreurConfigInvalide('La variable EBP_ENV doit être "prod" ou "preprod".', { variable: "EBP_ENV" });
  }
  const clientId = lireTexte("EBP_CLIENT_ID");
  const clientSecret = lireTexte("EBP_CLIENT_SECRET");
  const subscriptionKey = lireTexte("EBP_SUBSCRIPTION_KEY");
  const redirectUri = lireTexte("EBP_REDIRECT_URI");

  const quotaReserveTexte = lireTexte("EBP_QUOTA_RESERVE");
  let quotaReserve: number | undefined;
  if (quotaReserveTexte !== undefined) {
    if (!/^\d+$/.test(quotaReserveTexte)) {
      throw erreurConfigInvalide("La variable EBP_QUOTA_RESERVE doit être un entier >= 0.", {
        variable: "EBP_QUOTA_RESERVE",
      });
    }
    quotaReserve = Number.parseInt(quotaReserveTexte, 10);
  }

  const redactPiiTexte = lireTexte("EBP_REDACT_PII");
  let redactPii: boolean | undefined;
  if (redactPiiTexte !== undefined) {
    if (redactPiiTexte !== "true" && redactPiiTexte !== "false") {
      throw erreurConfigInvalide('La variable EBP_REDACT_PII doit être "true" ou "false".', {
        variable: "EBP_REDACT_PII",
      });
    }
    redactPii = redactPiiTexte === "true";
  }

  return {
    ...(profile !== undefined ? { profile } : {}),
    ...(envTexte !== undefined ? { env: envTexte as Environnement } : {}),
    ...(clientId !== undefined ? { clientId } : {}),
    ...(clientSecret !== undefined ? { clientSecret } : {}),
    ...(subscriptionKey !== undefined ? { subscriptionKey } : {}),
    ...(redirectUri !== undefined ? { redirectUri } : {}),
    ...(quotaReserve !== undefined ? { quotaReserve } : {}),
    ...(redactPii !== undefined ? { redactPii } : {}),
  };
}
