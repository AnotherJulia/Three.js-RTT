import { describe, expect, it } from "vitest";
import { intersectRect, rectContains, relativeRect } from "./rect";

describe("relativeRect", () => {
  it("subtracts the origin's position, keeping width/height", () => {
    const result = relativeRect({ left: 120, top: 80, width: 50, height: 30 }, { left: 100, top: 60, width: 0, height: 0 });
    expect(result).toEqual({ left: 20, top: 20, width: 50, height: 30 });
  });
});

describe("rectContains", () => {
  it("is true inside and on the boundary", () => {
    const rect = { left: 0, top: 0, width: 10, height: 10 };
    expect(rectContains(rect, 5, 5)).toBe(true);
    expect(rectContains(rect, 0, 0)).toBe(true);
    expect(rectContains(rect, 10, 10)).toBe(true);
  });

  it("is false outside", () => {
    const rect = { left: 0, top: 0, width: 10, height: 10 };
    expect(rectContains(rect, -1, 5)).toBe(false);
    expect(rectContains(rect, 11, 5)).toBe(false);
  });
});

describe("intersectRect", () => {
  it("returns the overlapping region", () => {
    const a = { left: 0, top: 0, width: 10, height: 10 };
    const b = { left: 5, top: 5, width: 10, height: 10 };
    expect(intersectRect(a, b)).toEqual({ left: 5, top: 5, width: 5, height: 5 });
  });

  it("returns null when rects don't overlap", () => {
    const a = { left: 0, top: 0, width: 5, height: 5 };
    const b = { left: 10, top: 10, width: 5, height: 5 };
    expect(intersectRect(a, b)).toBeNull();
  });
});
