/** Verrou inter-processus local (07 §3), hôte local seulement, pas de support NFS/multi-hôtes en v0.1. */
export interface Lock {
  release(): Promise<void>;
}

export interface LockManager {
  /** Attente bornée par `deadline` ; aucune suppression du lock d'un processus vivant sur simple ancienneté. */
  acquire(name: string, deadline: Date, signal?: AbortSignal): Promise<Lock>;
}
