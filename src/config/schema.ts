import { z } from "zod";
import type { Famille } from "../domain/capabilities.js";
import { RE_IDENTIFIANT, estGuid } from "./identifiers.js";

/** Familles d'adapters v0.1 (07 §1), dupliqué ici en tant que const pour les schémas Zod. */
const FAMILLES = ["hubbix-compta", "hubbix-gescom"] as const satisfies readonly Famille[];
const ENVIRONNEMENTS = ["prod", "preprod"] as const;

const zIdentifiant = z.string().regex(RE_IDENTIFIANT);

function estFuseauValide(valeur: string): boolean {
  try {
    // eslint-disable-next-line no-new -- utilisé pour sa seule capacité de validation
    new Intl.DateTimeFormat("en-US", { timeZone: valeur });
    return true;
  } catch {
    return false;
  }
}

/**
 * `redirectUri` strictement loopback (décision 7, 07 §3) : `http:`, hôte littéral `127.0.0.1`
 * ou `[::1]`, sans query ni fragment. `localhost` est refusé (résolution ambiguë IPv4/IPv6).
 */
export function estRedirectUriLoopback(valeur: string): boolean {
  let url: URL;
  try {
    url = new URL(valeur);
  } catch {
    return false;
  }
  if (url.protocol !== "http:") return false;
  if (url.hostname !== "127.0.0.1" && url.hostname !== "[::1]") return false;
  if (url.search !== "" || url.hash !== "") return false;
  return true;
}

export const schemaGroupeQuota = z
  .object({
    maxPerDay: z.int().min(1).default(10000),
    reserve: z.int().min(0).default(500),
    minIntervalMs: z.int().min(0).default(1000),
    resetTimezone: z
      .string()
      .default("Europe/Paris")
      .refine(estFuseauValide, { message: "resetTimezone invalide pour Intl.DateTimeFormat" }),
  })
  .strict()
  .refine((groupe) => groupe.reserve < groupe.maxPerDay, {
    message: "reserve doit être strictement inférieure à maxPerDay",
    path: ["reserve"],
  });

export type GroupeQuotaBrut = z.infer<typeof schemaGroupeQuota>;

export const schemaDossierConfigure = z
  .object({
    alias: zIdentifiant,
    famille: z.enum(FAMILLES),
    nom: z.string().nullable().optional(),
    tenantId: z.string().optional(),
    domainId: z.string().optional(),
  })
  .strict()
  .superRefine((dossier, ctx) => {
    if (dossier.famille === "hubbix-compta") {
      if (dossier.domainId !== undefined) {
        ctx.addIssue({ code: "custom", message: "domainId interdit pour hubbix-compta", path: ["domainId"] });
      }
      if (dossier.tenantId === undefined || !estGuid(dossier.tenantId)) {
        ctx.addIssue({ code: "custom", message: "tenantId GUID requis pour hubbix-compta", path: ["tenantId"] });
      }
    } else {
      if (dossier.tenantId !== undefined) {
        ctx.addIssue({ code: "custom", message: "tenantId interdit pour hubbix-gescom", path: ["tenantId"] });
      }
      if (dossier.domainId === undefined || !estGuid(dossier.domainId)) {
        ctx.addIssue({ code: "custom", message: "domainId GUID requis pour hubbix-gescom", path: ["domainId"] });
      }
    }
  });

export type DossierConfigureBrut = z.infer<typeof schemaDossierConfigure>;

const schemaSubscriptionFamille = z
  .object({
    key: z.string().min(1),
    quotaGroup: zIdentifiant,
  })
  .strict();

export const schemaProfil = z
  .object({
    env: z.enum(ENVIRONNEMENTS),
    clientId: z.string().min(1),
    clientSecret: z.string().min(1).optional(),
    subscriptionKey: z.string().min(1).optional(),
    redirectUri: z.string().min(1),
    pkce: z.enum(["required", "disabled"]).default("required"),
    enabledFamilies: z.array(z.enum(FAMILLES)).min(1),
    subscriptionByFamily: z.partialRecord(z.enum(FAMILLES), schemaSubscriptionFamille).optional(),
    quotaGroup: zIdentifiant,
    dossiers: z
      .object({
        prod: z.array(schemaDossierConfigure).default([]),
        preprod: z.array(schemaDossierConfigure).default([]),
      })
      .strict(),
    defaultDossier: z.partialRecord(z.enum(ENVIRONNEMENTS), zIdentifiant).optional(),
  })
  .strict()
  .superRefine((profil, ctx) => {
    if (new Set(profil.enabledFamilies).size !== profil.enabledFamilies.length) {
      ctx.addIssue({ code: "custom", message: "enabledFamilies contient un doublon", path: ["enabledFamilies"] });
    }

    for (const famille of Object.keys(profil.subscriptionByFamily ?? {})) {
      if (!profil.enabledFamilies.includes(famille as Famille)) {
        ctx.addIssue({
          code: "custom",
          message: `subscriptionByFamily référence une famille non activée : ${famille}`,
          path: ["subscriptionByFamily", famille],
        });
      }
    }

    for (const env of ENVIRONNEMENTS) {
      const aliases = profil.dossiers[env].map((d) => d.alias);
      if (new Set(aliases).size !== aliases.length) {
        ctx.addIssue({ code: "custom", message: `alias dupliqué dans dossiers.${env}`, path: ["dossiers", env] });
      }
      const defautEnv = profil.defaultDossier?.[env];
      if (defautEnv !== undefined && !aliases.includes(defautEnv)) {
        ctx.addIssue({
          code: "custom",
          message: `defaultDossier.${env} référence un alias absent de dossiers.${env}`,
          path: ["defaultDossier", env],
        });
      }
    }

    if (!estRedirectUriLoopback(profil.redirectUri)) {
      ctx.addIssue({
        code: "custom",
        message: "redirectUri doit être loopback (http://127.0.0.1 ou http://[::1]), sans query ni fragment",
        path: ["redirectUri"],
      });
    }
  });

export type ProfilBrut = z.infer<typeof schemaProfil>;

export const schemaFichierConfig = z
  .object({
    schemaVersion: z.literal(1),
    profiles: z.record(zIdentifiant, schemaProfil),
    quotaGroups: z.record(zIdentifiant, schemaGroupeQuota),
  })
  .strict()
  .superRefine((fichier, ctx) => {
    for (const [nomProfil, profil] of Object.entries(fichier.profiles)) {
      if (!(profil.quotaGroup in fichier.quotaGroups)) {
        ctx.addIssue({
          code: "custom",
          message: `quotaGroup "${profil.quotaGroup}" non déclaré dans quotaGroups`,
          path: ["profiles", nomProfil, "quotaGroup"],
        });
      }
      for (const [famille, sub] of Object.entries(profil.subscriptionByFamily ?? {})) {
        if (!(sub.quotaGroup in fichier.quotaGroups)) {
          ctx.addIssue({
            code: "custom",
            message: `quotaGroup "${sub.quotaGroup}" non déclaré dans quotaGroups`,
            path: ["profiles", nomProfil, "subscriptionByFamily", famille, "quotaGroup"],
          });
        }
      }
    }
  });

export type FichierConfig = z.infer<typeof schemaFichierConfig>;
