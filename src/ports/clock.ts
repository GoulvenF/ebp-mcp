/** Horloge injectable (07 §1) : aucune couche n'appelle `Date.now()` ou `setTimeout` directement. */
export interface Clock {
  now(): Date;
  /** Attente annulable ; se résout immédiatement si `signal` est déjà déclenché. */
  wait(durationMs: number, signal?: AbortSignal): Promise<void>;
}
