/** Avertissements non bloquants (07 §2), toujours sur stderr, jamais stdout en mode `serve`. */
export interface Journal {
  avertir(message: string): void;
}
