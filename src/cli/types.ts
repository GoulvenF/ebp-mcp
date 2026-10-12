/**
 * Dépendances du processus injectées par `src/cli.ts` (D-T13-1) : `executerCli` et tout le code
 * sous `src/cli/` ne touchent jamais `process.*` directement, seulement via cet objet — le seul
 * câblage `process` autorisé vit dans `src/cli.ts`.
 */
export interface DepsCli {
  readonly env: NodeJS.ProcessEnv;
  readonly home: string;
  readonly stdin: NodeJS.ReadableStream;
  readonly stdout: NodeJS.WritableStream;
  readonly stderr: NodeJS.WritableStream;
  /** Aborté sur SIGINT/SIGTERM (câblé par `src/cli.ts`). */
  readonly signal: AbortSignal;
  /**
   * Sortie immédiate du processus (D-T13-12) : seul moyen de garantir que le binaire sort bien
   * au-delà de la borne de `fermerAvecDelai`, quand des handles restent ouverts (c'est justement
   * la raison du dépassement). `process.exitCode` seul ne suffit pas dans ce cas précis.
   */
  readonly forcerSortie: (code: number) => never;
}
