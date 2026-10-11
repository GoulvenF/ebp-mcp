import type { ErreurMetier } from "../../domain/errors.js";

interface BlocTexte {
  readonly type: "text";
  readonly text: string;
}

/** Résultat MCP succès (D-T12-4, 07 §7) : `JSON.parse(content[0].text)` est toujours égal à `structuredContent`. */
export interface ReponseOutilSucces {
  readonly content: readonly [BlocTexte];
  readonly structuredContent: unknown;
  readonly isError: false;
}

/** Résultat MCP échec métier (D-T12-4, 07 §7) : jamais de `structuredContent` (validé contre `outputSchema` même en erreur). */
export interface ReponseOutilErreur {
  readonly content: readonly [BlocTexte];
  readonly isError: true;
}

export type ReponseOutil = ReponseOutilSucces | ReponseOutilErreur;

/** Succès (D-T12-4) : l'objet final `o` est sérialisé une seule fois, partagé par `content` et `structuredContent`. */
export function serialiserSucces(enveloppe: unknown): ReponseOutilSucces {
  return {
    content: [{ type: "text", text: JSON.stringify(enveloppe) }],
    structuredContent: enveloppe,
    isError: false,
  };
}

/** Échec métier (D-T12-4) : `content` porte `{erreur}` ; jamais `structuredContent`. */
export function serialiserErreur(erreur: ErreurMetier): ReponseOutilErreur {
  return {
    content: [{ type: "text", text: JSON.stringify({ erreur }) }],
    isError: true,
  };
}

export type ResultatRessource = { readonly text: string } | { readonly erreur: ErreurMetier };

/** Ressource MCP (D-T12-4, consommé au lot 3) : `{text}` en succès, `{erreur}` en échec — jamais les deux. */
export function serialiserRessource(valeur: unknown): ResultatRessource {
  return { text: JSON.stringify(valeur) };
}

export function serialiserErreurRessource(erreur: ErreurMetier): ResultatRessource {
  return { erreur };
}
