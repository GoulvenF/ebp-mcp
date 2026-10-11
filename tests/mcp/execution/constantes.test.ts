import { describe, expect, it } from "vitest";
import { BUDGET_TENTATIVES_OUTIL, DEADLINE_OUTIL_MS } from "../../../dist/index.js";

describe("mcp/execution/constantes — D-T12-3", () => {
  it("budget fixe de 30 tentatives par outil, auth et retries compris", () => {
    expect(BUDGET_TENTATIVES_OUTIL).toBe(30);
  });

  it("deadline fixe de 60 s depuis la réception de l'appel", () => {
    expect(DEADLINE_OUTIL_MS).toBe(60_000);
  });
});
