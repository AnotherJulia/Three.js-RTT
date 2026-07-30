import { describe, expect, it } from "vitest";
import { ScreenSurfaceRegistry } from "./ScreenSurfaceRegistry";

describe("ScreenSurfaceRegistry", () => {
  it("rejects focusing an id that is not registered", () => {
    const registry = new ScreenSurfaceRegistry();
    expect(() => registry.setFocused("missing")).toThrow('cannot focus unregistered screen "missing"');
    registry.disposeAll();
  });
});
