import { createHash } from "node:crypto";
import { join } from "node:path";
import type { Environnement } from "../domain/capabilities.js";

/**
 * Identité de stockage auth = profil + environnement + empreinte du client ID (07 §2/§3).
 * Changer l'un des trois éléments donne une clé et un répertoire différents : prod et préprod
 * (ou deux client ID distincts) n'échangent jamais de tokens. Le `clientId` n'apparaît jamais en
 * clair dans `cle` ou `repertoire`.
 */
export interface IdentiteStore {
  readonly profil: string;
  readonly environnement: Environnement;
  readonly empreinteClient: string;
  readonly cle: string;
  readonly repertoire: string;
}

export function identiteStore(
  racine: string,
  profil: string,
  environnement: Environnement,
  clientId: string,
): IdentiteStore {
  const empreinteClient = createHash("sha256").update(clientId, "utf8").digest("hex").slice(0, 16);
  const cle = `${profil}.${environnement}.${empreinteClient}`;
  const repertoire = join(racine, "auth", cle);
  return { profil, environnement, empreinteClient, cle, repertoire };
}
