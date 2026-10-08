import { chmod, link, mkdir, open, readdir, readFile, rename, stat, unlink, type FileHandle } from "node:fs/promises";
import { dirname } from "node:path";

/** Descripteur opaque renvoyé par {@link OperationsFichier.ouvrirExclusif}. */
export type Descripteur = FileHandle;

export interface StatutFichier {
  readonly mode: number;
  readonly taille: number;
}

/**
 * Port d'injection FS (décision 3, fiche T04) : expose exactement les opérations critiques dont
 * les échecs sont testés. Les tests injectent un décorateur qui fait échouer la N-ième occurrence
 * d'une opération donnée ; aucun monkey-patch de `node:fs`.
 */
export interface OperationsFichier {
  creerRepertoire(chemin: string, mode: number): Promise<void>;
  /** `O_CREAT|O_EXCL|O_WRONLY` ; échoue avec `EEXIST` si `chemin` existe déjà. */
  ouvrirExclusif(chemin: string, mode: number): Promise<Descripteur>;
  ecrireTout(descripteur: Descripteur, donnees: string): Promise<void>;
  synchroniser(descripteur: Descripteur): Promise<void>;
  fermer(descripteur: Descripteur): Promise<void>;
  renommer(ancien: string, nouveau: string): Promise<void>;
  /** Lien physique ; échoue avec `EEXIST` si `nouveau` existe déjà (décision 7 révisée, revue T04). */
  lier(ancien: string, nouveau: string): Promise<void>;
  supprimer(chemin: string): Promise<void>;
  lireFichier(chemin: string): Promise<string>;
  statut(chemin: string): Promise<StatutFichier>;
  listerRepertoire(chemin: string): Promise<string[]>;
  /** Fsync du répertoire ; meilleur effort, l'appelant ignore un échec documenté (Windows). */
  synchroniserRepertoire(chemin: string): Promise<void>;
  definirPermissions(chemin: string, mode: number): Promise<void>;
}

async function ecrireBufferComplet(descripteur: Descripteur, donnees: Buffer): Promise<void> {
  let ecrit = 0;
  while (ecrit < donnees.length) {
    const { bytesWritten } = await descripteur.write(donnees, ecrit, donnees.length - ecrit, ecrit);
    if (bytesWritten <= 0) {
      throw new Error("Écriture interrompue sans progression.");
    }
    ecrit += bytesWritten;
  }
}

/** Implémentation Node réelle, sur `node:fs/promises` uniquement (aucune dépendance npm). */
export function creerOperationsFichierNode(): OperationsFichier {
  return {
    async creerRepertoire(chemin, mode) {
      await mkdir(chemin, { recursive: true, mode });
    },
    async ouvrirExclusif(chemin, mode) {
      return open(chemin, "wx", mode);
    },
    async ecrireTout(descripteur, donnees) {
      await ecrireBufferComplet(descripteur, Buffer.from(donnees, "utf8"));
    },
    async synchroniser(descripteur) {
      await descripteur.sync();
    },
    async fermer(descripteur) {
      await descripteur.close();
    },
    async renommer(ancien, nouveau) {
      await rename(ancien, nouveau);
    },
    async lier(ancien, nouveau) {
      await link(ancien, nouveau);
    },
    async supprimer(chemin) {
      await unlink(chemin);
    },
    async lireFichier(chemin) {
      return readFile(chemin, "utf8");
    },
    async statut(chemin) {
      const stats = await stat(chemin);
      return { mode: stats.mode & 0o777, taille: stats.size };
    },
    async listerRepertoire(chemin) {
      return readdir(chemin);
    },
    async synchroniserRepertoire(chemin) {
      const handle = await open(chemin, "r");
      try {
        await handle.sync();
      } finally {
        await handle.close();
      }
    },
    async definirPermissions(chemin, mode) {
      await chmod(chemin, mode);
    },
  };
}

/** Utilitaire partagé : répertoire contenant `chemin`, pour fsync répertoire et temporaire co-localisé. */
export function repertoireParent(chemin: string): string {
  return dirname(chemin);
}
