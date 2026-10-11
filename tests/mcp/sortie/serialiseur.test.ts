import { describe, expect, it } from "vitest";
import { serialiserErreur, serialiserRessource, serialiserSucces } from "../../../dist/index.js";

describe("serialiserSucces/serialiserErreur — D-T12-4", () => {
  it("succès : JSON.parse(content[0].text) est profondément égal à structuredContent, isError: false", () => {
    const enveloppe = { dossier: "d1", resultats: [{ id: "1" }], pagination: null, meta: { mode: "mock" } };
    const reponse = serialiserSucces(enveloppe);
    expect(reponse.isError).toBe(false);
    expect(JSON.parse(reponse.content[0].text)).toEqual(reponse.structuredContent);
    expect(reponse.structuredContent).toEqual(enveloppe);
  });

  it("échec : isError: true, pas de structuredContent, texte = {erreur:{code,message,action}}", () => {
    const erreur = { code: "NOT_FOUND" as const, message: "Introuvable.", action: "Vérifier l'identifiant." };
    const reponse = serialiserErreur(erreur);
    expect(reponse.isError).toBe(true);
    expect(reponse).not.toHaveProperty("structuredContent");
    expect(JSON.parse(reponse.content[0].text)).toEqual({ erreur });
  });

  it("ressource : {text} en succès", () => {
    const resultat = serialiserRessource({ dossiers: [] });
    expect(resultat).toEqual({ text: JSON.stringify({ dossiers: [] }) });
  });
});
