/**
 * Dépendances du processus injectées par `src/cli.ts` (D-T13-9) : `executerCli` et tout le code
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
}
