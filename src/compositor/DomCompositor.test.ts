import { beforeEach, describe, expect, it, vi } from "vitest";
import { DomCompositor } from "./DomCompositor";
import * as dirtyTracking from "./dirtyTracking";
import type { RasterFrame, RasterStrategy } from "../types";

function fakeStrategy(): RasterStrategy {
  const canvas = document.createElement("canvas");
  return {
    attach: () => {},
    resize: () => {},
    detach: () => {},
    capture: async (): Promise<RasterFrame> => ({ canvas, width: canvas.width, height: canvas.height }),
  };
}

// happy-dom (this repo's test environment) doesn't implement a real 2D canvas
// context — stub just enough of it for DomCompositor's own draw calls.
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    clearRect: () => {},
    drawImage: () => {},
    save: () => {},
    restore: () => {},
    scale: () => {},
    beginPath: () => {},
    rect: () => {},
    clip: () => {},
  } as unknown as CanvasRenderingContext2D);
});

describe("DomCompositor tick", () => {
  it("does not re-scan for live elements on a clean tick once none were found", async () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const compositor = new DomCompositor({ root, width: 10, height: 10, strategy: fakeStrategy() });

    // First tick: dirty by default (DirtyTracker starts dirty), so a scan happens.
    const spy = vi.spyOn(dirtyTracking, "findLiveElements");
    await compositor.tick();
    expect(spy).toHaveBeenCalledTimes(1);

    // Second tick: clean, no live elements were found last time — must be skipped.
    spy.mockClear();
    await compositor.tick();
    expect(spy).not.toHaveBeenCalled();

    compositor.dispose();
    root.remove();
  });

  it("still scans every tick once a live element has been found", async () => {
    const root = document.createElement("div");
    const video = document.createElement("video");
    root.appendChild(video);
    document.body.appendChild(root);
    const compositor = new DomCompositor({ root, width: 10, height: 10, strategy: fakeStrategy() });

    await compositor.tick(); // dirty: finds the <video>, sets hasLiveElements

    const spy = vi.spyOn(dirtyTracking, "findLiveElements");
    await compositor.tick(); // clean, but hasLiveElements is true — must still scan
    expect(spy).toHaveBeenCalledTimes(1);

    compositor.dispose();
    root.remove();
  });

  it("resumes scanning once a mutation makes it dirty again", async () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const compositor = new DomCompositor({ root, width: 10, height: 10, strategy: fakeStrategy() });

    await compositor.tick(); // dirty, no live elements -> hasLiveElements = false
    root.appendChild(document.createElement("canvas"));
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    const spy = vi.spyOn(dirtyTracking, "findLiveElements");
    await compositor.tick(); // dirty again from the mutation -> must scan and find the canvas
    expect(spy).toHaveBeenCalledTimes(1);

    compositor.dispose();
    root.remove();
  });
});
