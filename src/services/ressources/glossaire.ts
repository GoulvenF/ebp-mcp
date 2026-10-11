import { z } from "zod";

export const TermeGlossaireSchema = z
  .object({
    terme: z.string().min(1),
    fr: z.string().min(1),
    en: z.string().min(1),
  })
  .strict();

export type TermeGlossaire = z.infer<typeof TermeGlossaireSchema>;

export const GlossaireSchema = z.array(TermeGlossaireSchema);

/**
 * Ressource `ebp://glossaire` (D-T12-13, 07 §6) : JSON statique FR/EN rédigé à la main, cohérent
 * avec 07 — lignes distinctes des écritures, balance de mouvements sans solde d'ouverture,
 * `completude`/`approximatif`/`raison_arret`, tiers identifiés par ID, PII limitée aux emails,
 * téléphones et IBAN. Jamais généré depuis une exécution ou recopié d'une réponse EBP.
 */
export const GLOSSAIRE: readonly TermeGlossaire[] = [
  {
    terme: "dossier",
    fr: "Espace de travail EBP identifié par un alias local, associé à une famille (Comptabilité ou Gestion Commerciale) et à un identifiant distant (tenant ou domaine).",
    en: "An EBP workspace identified by a local alias, tied to a family (Accounting or Sales Management) and a remote identifier (tenant or domain).",
  },
  {
    terme: "famille",
    fr: "Catégorie d'adapter EBP ciblée par un dossier : hubbix-compta (Comptabilité) ou hubbix-gescom (Gestion Commerciale).",
    en: "The EBP adapter category targeted by a folder: hubbix-compta (Accounting) or hubbix-gescom (Sales Management).",
  },
  {
    terme: "tiers",
    fr: "Client, prospect ou fournisseur identifié par son identifiant interne (ID) ; jamais rapproché par son seul nom.",
    en: "A customer, prospect or supplier identified by its internal ID; never matched by name alone.",
  },
  {
    terme: "ligne et écriture",
    fr: "Une écriture comptable regroupe plusieurs lignes (débit/crédit) ; les outils de liste renvoient des lignes individuelles, pas l'écriture complète.",
    en: "An accounting entry groups several lines (debit/credit); list tools return individual lines, not the full entry.",
  },
  {
    terme: "balance de mouvements",
    fr: "Totaux débit/crédit par compte sur une période, sans solde d'ouverture implicite : ce n'est pas un bilan.",
    en: "Debit/credit totals per account over a period, with no implicit opening balance: this is not a balance sheet.",
  },
  {
    terme: "grand livre",
    fr: "Liste chronologique des lignes d'un compte sur une période, sans cumul prétendu depuis l'origine du compte.",
    en: "A chronological list of an account's lines over a period, without any claimed running total since the account's origin.",
  },
  {
    terme: "échéance et en_retard",
    fr: "Date attendue de règlement d'un document ; en_retard est vrai seulement si un reste dû existe et que l'échéance est strictement passée.",
    en: "The expected payment date of a document; en_retard is true only when an amount remains due and the due date is strictly in the past.",
  },
  {
    terme: "completude",
    fr: "Indique si un résultat est complet, limité à une page, ou partiel après une interruption (budget, quota, deadline…).",
    en: "Indicates whether a result is complete, limited to one page, or partial after an interruption (budget, quota, deadline…).",
  },
  {
    terme: "approximatif",
    fr: "Vrai quand un résultat a été interrompu avant son terme : les totaux affichés ne couvrent alors qu'une partie des données.",
    en: "True when a result was interrupted before completion: the totals shown then cover only part of the data.",
  },
  {
    terme: "raison_arret",
    fr: "Cause documentée d'une interruption de parcours (limite, budget, quota, deadline, source_incomplete, cursor_capacity) ; null si le parcours n'a pas été interrompu.",
    en: "The documented cause of an interrupted scan (limite, budget, quota, deadline, source_incomplete, cursor_capacity); null when the scan was not interrupted.",
  },
  {
    terme: "curseur",
    fr: "Jeton opaque permettant de reprendre une liste là où elle s'est arrêtée ; expire après 15 minutes et n'est valable que pour la même requête.",
    en: "An opaque token used to resume a list where it left off; expires after 15 minutes and is only valid for the same request.",
  },
  {
    terme: "mode mock/live",
    fr: "mock utilise des réponses synthétiques hors ligne ; live interroge réellement l'API EBP. Toujours déclaré explicitement, jamais implicite.",
    en: "mock uses offline synthetic responses; live actually queries the EBP API. Always declared explicitly, never implicit.",
  },
  {
    terme: "PII",
    fr: "Données personnelles masquées en mode EBP_REDACT_PII=true : emails, téléphones et IBAN uniquement ; pas une anonymisation générale.",
    en: "Personal data masked under EBP_REDACT_PII=true: emails, phone numbers and IBAN only; not a general anonymization.",
  },
];
