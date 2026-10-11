export { ctxDe, ctxGcDe, depsDe } from "../compta/fixtures.js";

export interface JournalEbpFactice {
  readonly uuid: string;
  readonly code: string;
  readonly name: string;
  readonly journalType: null;
  readonly counterpartAccount: null;
}

export function journalEbp(index: number): JournalEbpFactice {
  return { uuid: `journal-${index}`, code: `J${index}`, name: `Journal ${index}`, journalType: null, counterpartAccount: null };
}

export function corpsJournaux(n: number): { data: JournalEbpFactice[] } {
  return { data: Array.from({ length: n }, (_, i) => journalEbp(i)) };
}

export interface CompteEbpFactice {
  readonly uuid: string;
  readonly number: string;
  readonly label: string;
  readonly active: boolean;
  readonly collective: boolean;
  readonly racine: boolean;
}

export function compteEbp(index: number): CompteEbpFactice {
  return { uuid: `compte-${index}`, number: `${600000 + index}`, label: `Compte ${index}`, active: true, collective: false, racine: false };
}

export function corpsComptes(n: number): { data: CompteEbpFactice[] } {
  return { data: Array.from({ length: n }, (_, i) => compteEbp(i)) };
}

export interface TauxTvaCptEbpFactice {
  readonly designation: string;
  readonly rate: string;
  readonly isActive: boolean;
  readonly territoriality: null;
}

export function tauxTvaCptEbp(index: number): TauxTvaCptEbpFactice {
  return { designation: `Taux ${index}`, rate: "20.0000", isActive: true, territoriality: null };
}

export function corpsTauxTvaCpt(n: number): { data: TauxTvaCptEbpFactice[] } {
  return { data: Array.from({ length: n }, (_, i) => tauxTvaCptEbp(i)) };
}

export interface TauxTvaGcEbpFactice {
  readonly label: string;
  readonly rate: string;
  readonly territoriality: number;
  readonly isDefault: boolean;
}

export function tauxTvaGcEbp(index: number): TauxTvaGcEbpFactice {
  return { label: `Taux GC ${index}`, rate: "20.0000", territoriality: 0, isDefault: index === 0 };
}

export function corpsTauxTvaGc(n: number): TauxTvaGcEbpFactice[] {
  return Array.from({ length: n }, (_, i) => tauxTvaGcEbp(i));
}
