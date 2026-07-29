import { describe, expect, it } from "vitest";
import { captureHitTestSnapshot, hitTestSnapshot } from "./hitTest";

function setup(html: string): HTMLElement {
  document.body.innerHTML = `<div id="root">${html}</div>`;
  return document.getElementById("root") as HTMLElement;
}

// happy-dom returns zero-size rects by default; stub layout explicitly per test.
function stubRect(el: Element, rect: Partial<DOMRect>): void {
  Object.assign(el, {
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON() {}, ...rect }),
  });
}

describe("hitTestSnapshot", () => {
  it("returns null when nothing at the point", () => {
    const root = setup(`<button id="a">A</button>`);
    stubRect(root, { width: 100, height: 100 });
    stubRect(root.querySelector("#a")!, { left: 0, top: 0, width: 20, height: 20 });
    const snapshot = captureHitTestSnapshot(root);
    expect(hitTestSnapshot(snapshot, 50, 50)).toBeNull();
  });

  it("prefers the smaller, more specific element among overlapping siblings", () => {
    const root = setup(`<div id="outer"><button id="inner">B</button></div>`);
    stubRect(root, { width: 100, height: 100 });
    stubRect(root.querySelector("#outer")!, { left: 0, top: 0, width: 100, height: 100 });
    stubRect(root.querySelector("#inner")!, { left: 10, top: 10, width: 20, height: 20 });

    const snapshot = captureHitTestSnapshot(root);
    const hit = hitTestSnapshot(snapshot, 15, 15);
    expect(hit?.id).toBe("inner");
  });

  it("skips elements with pointer-events: none", () => {
    const root = setup(`<button id="blocked" style="pointer-events:none">X</button>`);
    stubRect(root, { width: 100, height: 100 });
    stubRect(root.querySelector("#blocked")!, { left: 0, top: 0, width: 50, height: 50 });
    const snapshot = captureHitTestSnapshot(root);
    expect(hitTestSnapshot(snapshot, 10, 10)).toBeNull();
  });

  it("prefers higher explicit z-index over document order", () => {
    const root = setup(`
      <div id="back" style="position:absolute; z-index:1"></div>
      <div id="front" style="position:absolute; z-index:5"></div>
    `);
    stubRect(root, { width: 100, height: 100 });
    stubRect(root.querySelector("#back")!, { left: 0, top: 0, width: 50, height: 50 });
    stubRect(root.querySelector("#front")!, { left: 0, top: 0, width: 50, height: 50 });

    const snapshot = captureHitTestSnapshot(root);
    const hit = hitTestSnapshot(snapshot, 10, 10);
    expect(hit?.id).toBe("front");
  });
});
