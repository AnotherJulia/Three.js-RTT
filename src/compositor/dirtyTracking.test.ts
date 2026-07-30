import { describe, expect, it } from "vitest";
import { DirtyTracker, findLiveElements } from "./dirtyTracking";

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

  it("does not clear a redraw requested during an in-flight capture", () => {
    const root = document.createElement("div");
    const tracker = new DirtyTracker(root, "mutation-observer");
    const captureRevision = tracker.getRevision();

    tracker.requestRedraw();
    tracker.markClean(captureRevision);

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

  it("intersects every scrolling and clipping ancestor for live elements", () => {
    const root = document.createElement("div");
    const outer = document.createElement("div");
    const inner = document.createElement("div");
    const canvas = document.createElement("canvas");
    outer.style.overflowX = "hidden";
    outer.style.overflowY = "hidden";
    inner.style.overflowX = "auto";
    inner.style.overflowY = "auto";
    inner.appendChild(canvas);
    outer.appendChild(inner);
    root.appendChild(outer);
    const rects = new Map<Element, Partial<DOMRect>>([
      [root, { left: 0, top: 0, width: 100, height: 100 }],
      [outer, { left: 10, top: 10, width: 70, height: 70 }],
      [inner, { left: 20, top: 20, width: 70, height: 70 }],
      [canvas, { left: 15, top: 15, width: 100, height: 100 }],
    ]);
    for (const [element, rect] of rects) {
      Object.assign(element, {
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0, ...rect }),
      });
    }

    const [live] = findLiveElements(root);
    expect(live?.clip).toEqual({ left: 20, top: 20, width: 60, height: 60 });
  });
});
