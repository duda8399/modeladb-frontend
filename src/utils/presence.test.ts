import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { colorForUserId, initialFor } from "./presence";

describe("presence", () => {
  it("a cor de um usuário é determinística (igual em todos os navegadores)", () => {
    fc.assert(
      fc.property(fc.string(), (userId) => {
        expect(colorForUserId(userId)).toBe(colorForUserId(userId));
      }),
    );
  });

  it("sempre gera uma cor HSL válida", () => {
    fc.assert(
      fc.property(fc.string(), (userId) => {
        const match = colorForUserId(userId).match(/^hsl\((\d+), 65%, 45%\)$/);
        expect(match).not.toBeNull();
        expect(Number(match![1])).toBeLessThan(360);
      }),
    );
  });

  it("ids diferentes tendem a cores diferentes", () => {
    const ids = Array.from({ length: 50 }, (_, i) => `6a${i.toString(16).padStart(22, "0")}`);
    const colors = new Set(ids.map(colorForUserId));

    expect(colors.size).toBeGreaterThan(40);
  });

  it("a inicial é a primeira letra em maiúscula, ou ? para texto vazio", () => {
    expect(initialFor("maria@x.com")).toBe("M");
    expect(initialFor("")).toBe("?");
  });
});
