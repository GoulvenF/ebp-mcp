import type { Clock } from "../ports/clock.js";
import type { DecimalString } from "./decimal.js";
import { decimalCompare } from "./decimal.js";

/** Date civile stricte `YYYY-MM-DD`, sans heure ni fuseau (07 §5). */
export type DateCivile = string;

const FORME_DATE_CIVILE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Valide un `YYYY-MM-DD` réellement calendaire (29 février uniquement les années bissextiles).
 * Rejette tout lexème ambigu : timestamp, espace de bord, mois/jour non complétés sur 2 chiffres.
 */
export function estDateCivile(valeur: unknown): valeur is DateCivile {
  if (typeof valeur !== "string") {
    return false;
  }
  const correspondance = FORME_DATE_CIVILE.exec(valeur);
  if (!correspondance) {
    return false;
  }
  const annee = Number(correspondance[1]);
  const mois = Number(correspondance[2]);
  const jour = Number(correspondance[3]);
  if (mois < 1 || mois > 12) {
    return false;
  }
  const bissextile = (annee % 4 === 0 && annee % 100 !== 0) || annee % 400 === 0;
  const joursParMois = [31, bissextile ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const joursMaxDuMois = joursParMois[mois - 1] ?? 31;
  return jour >= 1 && jour <= joursMaxDuMois;
}

function joursDepuisEpoque(dateCivile: DateCivile): number {
  const correspondance = FORME_DATE_CIVILE.exec(dateCivile);
  if (!correspondance) {
    throw new Error(`Date civile invalide : ${dateCivile}`);
  }
  const annee = Number(correspondance[1]);
  const mois = Number(correspondance[2]);
  const jour = Number(correspondance[3]);
  // Calendrier grégorien en arithmétique entière (algorithme de Fliegel–Van Flandern) : jamais
  // de `Date` local, donc indépendant du fuseau du process et du passage heure d'été.
  const a = Math.floor((14 - mois) / 12);
  const y = annee + 4800 - a;
  const m = mois + 12 * a - 3;
  return (
    jour +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045
  );
}

/** Différence en jours civils, en arithmétique de calendrier, insensible au fuseau et à la DST. */
export function joursCivilsEntre(du: DateCivile, au: DateCivile): number {
  return joursDepuisEpoque(au) - joursDepuisEpoque(du);
}

/** Durée inclusive des deux bornes (A10) : un seul jour ⇒ `1`. */
export function dureeInclusiveJours(du: DateCivile, au: DateCivile): number {
  return joursCivilsEntre(du, au) + 1;
}

export type ResultatIntervalle =
  | { ok: true }
  | { ok: false; code: "INVALID_ARGUMENT"; message: string };

/** Exige `du <= au` ; aucune fenêtre négative tolérée silencieusement. */
export function validerIntervalle(intervalle: { du: DateCivile; au: DateCivile }): ResultatIntervalle {
  if (joursCivilsEntre(intervalle.du, intervalle.au) < 0) {
    return {
      ok: false,
      code: "INVALID_ARGUMENT",
      message: `Intervalle invalide : du (${intervalle.du}) postérieur à au (${intervalle.au})`,
    };
  }
  return { ok: true };
}

const formateursParFuseau = new Map<string, Intl.DateTimeFormat>();

/** Formateur `Intl` mémoïsé par fuseau (décision T05) : jamais recréé à chaque appel. */
function formateurPourFuseau(fuseau: string): Intl.DateTimeFormat {
  let formateur = formateursParFuseau.get(fuseau);
  if (formateur === undefined) {
    formateur = new Intl.DateTimeFormat("fr-FR", {
      timeZone: fuseau,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    formateursParFuseau.set(fuseau, formateur);
  }
  return formateur;
}

/**
 * Date civile de `instant` dans `fuseau` (07 §4, rollover des groupes de quota) : chaque fuseau
 * utilisé obtient son propre formateur mémoïsé, créé une seule fois.
 */
export function dateCivileDansFuseau(instant: Date, fuseau: string): DateCivile {
  const parties = formateurPourFuseau(fuseau).formatToParts(instant);
  const annee = parties.find((partie) => partie.type === "year")?.value;
  const mois = parties.find((partie) => partie.type === "month")?.value;
  const jour = parties.find((partie) => partie.type === "day")?.value;
  if (!annee || !mois || !jour) {
    throw new Error(`Impossible de calculer la date civile dans le fuseau ${fuseau}`);
  }
  return `${annee}-${mois}-${jour}`;
}

/** Date civile du jour en Europe/Paris, via l'horloge injectée (07 §1) : aucun `Date.now()` direct. */
export function aujourdHuiParis(clock: Clock): DateCivile {
  return dateCivileDansFuseau(clock.now(), "Europe/Paris");
}

/** `max(0, aujourd'hui − échéance)` en jours civils ; échéance absente ⇒ `null` (07 §8). */
export function joursRetard(aujourdHui: DateCivile, echeance: DateCivile | null): number | null {
  if (echeance === null) {
    return null;
  }
  return Math.max(0, joursCivilsEntre(echeance, aujourdHui));
}

/**
 * `resteDu > 0 && echeance < aujourdHui` (07 §8). Échéance du jour n'est pas en retard.
 * Reste dû ou échéance absents ⇒ `null`, jamais `false` (donnée inconnue ≠ zéro).
 */
export function estEnRetard(
  resteDu: DecimalString | null,
  echeance: DateCivile | null,
  aujourdHui: DateCivile,
): boolean | null {
  if (resteDu === null || echeance === null) {
    return null;
  }
  return decimalCompare(resteDu, "0") > 0 && joursCivilsEntre(echeance, aujourdHui) > 0;
}
