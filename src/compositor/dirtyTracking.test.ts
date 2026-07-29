import { describe, expect, it } from "vitest";
import { DirtyTracker } from "./dirtyTracking";

describe("DirtyTracker", () => {
  it("mode 'always' is always dirty", () => {
    const root = document.createElement("div");
    const tracker = new DirtyTracker(root, "always");
    tracker.markClean();
    expect(tracker.isDirty()).toBe(true);
  });

  it("a predicate function is consulted directly", () => {
    const root = document.createElement("div");
    let flag = false;
    const tracker = new DirtyTracker(root, () => flag);
    expect(tracker.isDirty()).toBe(false);
    flag = true;
    expect(tracker.isDirty()).toBe(true);
  });

  it("starts dirty and clears on markClean under mutation-observer mode", () => {
    const root = document.createElement("div");
    const tracker = new DirtyTracker(root, "mutation-observer");
    expect(tracker.isDirty()).toBe(true);
    tracker.markClean();
    expect(tracker.isDirty()).toBe(false);
  });

  it("requestRedraw forces dirty again", () => {
    const root = document.createElement("div");
    const tracker = new DirtyTracker(root, "mutation-observer");
    tracker.markClean();
    tracker.requestRedraw();
    expect(tracker.isDirty()).toBe(true);
  });

  it("a DOM mutation marks it dirty again", async () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const tracker = new DirtyTracker(root, "mutation-observer");
    tracker.markClean();
    root.appendChild(document.createElement("span"));
    await new Promise<void>((resolve) => queueMicrotask(() => resolve()));
    expect(tracker.isDirty()).toBe(true);
    tracker.dispose();
    root.remove();
  });
});
