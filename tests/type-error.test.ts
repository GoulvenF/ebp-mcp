import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const tscBin = path.join(repoRoot, "node_modules", ".bin", "tsc");

describe("gate typecheck", () => {
  it("détecte l'erreur de type volontaire de tests/fixtures/type-error.fixture.ts", () => {
    expect(() =>
      execFileSync(tscBin, ["-p", "tsconfig.fixture-check.json"], {
        cwd: repoRoot,
        stdio: "pipe",
      }),
    ).toThrow();
  });

  it("ne compile jamais cette fixture via tsconfig.json (dépôt propre)", () => {
    // tsconfig.json exclut tests/fixtures : si ce test échouait, `npm run typecheck`
    // échouerait aussi sur le dépôt propre, ce qui n'est pas accepté.
    expect(() =>
      execFileSync(tscBin, ["--noEmit", "-p", "tsconfig.json"], {
        cwd: repoRoot,
        stdio: "pipe",
      }),
    ).not.toThrow();
  });
});
