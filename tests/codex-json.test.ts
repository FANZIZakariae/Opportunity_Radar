import { describe, expect, it } from "vitest";
import { extractJson } from "@/lib/codex-json";

describe("Codex JSON extraction", () => {
  it("extracts compact JSON from a CLI message", () => {
    expect(extractJson<{ ok: boolean }>('diagnostic\n{"ok":true}\n')).toEqual({ ok: true });
  });

  it("repairs a trailing comma without inventing fields", () => {
    expect(extractJson<{ values: number[] }>('{"values":[1,2,],}')).toEqual({ values: [1, 2] });
  });
});
