import type { IdentiteScan } from "../../pagination/scan.js";
import type { IdentiteParcours } from "../../pagination/agregat.js";
import type { ContexteService } from "../commun/types.js";

/** `IdentiteScan` commune à tous les services GC (D-T11-1) : un seul endroit assemble ces champs. */
export function identiteScanGescom(ctx: ContexteService, outil: string, limite: number, filtres?: unknown): IdentiteScan {
  return {
    outil,
    profil: ctx.execution.profil,
    identiteGeneration: ctx.execution.identiteGeneration,
    environnement: ctx.execution.environnement,
    famille: ctx.dossier.famille,
    dossier: ctx.dossier.id,
    limite,
    ...(filtres !== undefined ? { filtres } : {}),
  };
}

/** `IdentiteParcours` commune (D-T11-12), sans `limite` : réservée aux agrégats (hors périmètre GC v0.1). */
export function identiteParcoursGescom(ctx: ContexteService, outil: string, filtres?: unknown): IdentiteParcours {
  return {
    outil,
    profil: ctx.execution.profil,
    identiteGeneration: ctx.execution.identiteGeneration,
    environnement: ctx.execution.environnement,
    famille: ctx.dossier.famille,
    dossier: ctx.dossier.id,
    ...(filtres !== undefined ? { filtres } : {}),
  };
}
