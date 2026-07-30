import { describe, expect, it } from "vitest";
import { findActivationTarget, forwardPointerEvent, scrollNearestAncestor } from "./pointerForwarding";

function setScrollMetrics(element: HTMLElement, clientHeight: number, scrollHeight: number): void {
  Object.defineProperties(element, {
    clientHeight: { configurable: true, value: clientHeight },
    scrollHeight: { configurable: true, value: scrollHeight },
  });
}

describe("scrollNearestAncestor", () => {
  it("scrolls the closest scrollable panel containing the hit target", () => {
    document.body.innerHTML = `
      <div id="root"><div id="panel" style="overflow-y:auto"><button id="target">Target</button></div></div>
    `;
    const root = document.getElementById("root") as HTMLElement;
    const panel = document.getElementById("panel") as HTMLElement;
    const target = document.getElementById("target") as HTMLElement;
    setScrollMetrics(panel, 100, 300);

    const didScroll = scrollNearestAncestor(root, target, new WheelEvent("wheel", { deltaY: 40 }));

    expect(didScroll).toBe(true);
    expect(panel.scrollTop).toBe(40);
  });

  it("bubbles at a nested panel boundary to a scrollable parent", () => {
    document.body.innerHTML = `
      <div id="root"><div id="outer" style="overflow-y:auto"><div id="inner" style="overflow-y:auto"><button id="target">Target</button></div></div></div>
    `;
    const root = document.getElementById("root") as HTMLElement;
    const outer = document.getElementById("outer") as HTMLElement;
    const inner = document.getElementById("inner") as HTMLElement;
    const target = document.getElementById("target") as HTMLElement;
    setScrollMetrics(outer, 100, 300);
    setScrollMetrics(inner, 100, 300);
    inner.scrollTop = 200;

    const didScroll = scrollNearestAncestor(root, target, new WheelEvent("wheel", { deltaY: 40 }));

    expect(didScroll).toBe(true);
    expect(inner.scrollTop).toBe(200);
    expect(outer.scrollTop).toBe(40);
  });
});

describe("control event forwarding", () => {
  it("promotes a nested visual element to its owning button", () => {
    document.body.innerHTML = `<button id="launch"><span id="label">Launch</span></button>`;

    expect(findActivationTarget(document.getElementById("label") as HTMLElement).id).toBe("launch");
  });

  it("forwards pointer and compatibility mouse events for controls using either API", () => {
    document.body.innerHTML = `<div id="root"><button id="launch">Launch</button></div>`;
    const root = document.getElementById("root") as HTMLElement;
    const launch = document.getElementById("launch") as HTMLElement;
    Object.assign(root, { getBoundingClientRect: () => new DOMRect(0, 0, 100, 100) });
    const received: string[] = [];
    launch.addEventListener("pointerdown", () => received.push("pointerdown"));
    launch.addEventListener("mousedown", () => received.push("mousedown"));

    forwardPointerEvent({
      root,
      target: launch,
      type: "pointerdown",
      localX: 20,
      localY: 30,
      nativeEvent: new PointerEvent("pointerdown", { pointerId: 1, pointerType: "mouse" }),
    });

    expect(received).toEqual(["pointerdown", "mousedown"]);
  });
});
