/**
 * Course entre une fermeture asynchrone et une borne de temps (D-T13-12, 07 §12) : isolé de
 * `commandes/serve.ts` pour être testé sans processus `serve` réel (promesse qui ne se règle
 * jamais, minuteur factice).
 */
export async function fermerAvecDelai(fermer: () => Promise<void>, delaiMs: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let reglee = false;
    const minuteur = setTimeout(() => {
      if (reglee) return;
      reglee = true;
      resolve(false);
    }, delaiMs);
    fermer()
      .then(() => {
        if (reglee) return;
        reglee = true;
        clearTimeout(minuteur);
        resolve(true);
      })
      .catch(() => {
        if (reglee) return;
        reglee = true;
        clearTimeout(minuteur);
        resolve(true);
      });
  });
}
