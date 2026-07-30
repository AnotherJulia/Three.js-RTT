import { PerspectiveCamera, type Raycaster, Vector2 } from "three";
import { describe, expect, it } from "vitest";
import { InputBridge } from "./InputBridge";

describe("InputBridge host event containment", () => {
  it("keeps a handled canvas press from reaching host outside-click listeners", () => {
    document.body.innerHTML = '<div id="canvas"></div><div id="root"><button id="launch">Launch</button></div>';
    const canvas = document.getElementById("canvas") as HTMLElement;
    const root = document.getElementById("root") as HTMLElement;
    const launch = document.getElementById("launch") as HTMLElement;

    Object.assign(canvas, {
      getBoundingClientRect: () => new DOMRect(0, 0, 100, 100),
      setPointerCapture: () => undefined,
    });
    Object.assign(root, { getBoundingClientRect: () => new DOMRect(0, 0, 100, 100) });
    Object.assign(launch, { getBoundingClientRect: () => new DOMRect(0, 0, 80, 24) });
    // Mirrors an embedded app root that contains forwarded events locally.
    root.addEventListener("pointerdown", (event) => event.stopPropagation());

    const bridge = new InputBridge({
      camera: new PerspectiveCamera(),
      domElement: canvas,
      mesh: {} as never,
      root,
      raycaster: {
        setFromCamera: () => undefined,
        intersectObject: () => [{ uv: new Vector2(0.5, 0.9) }],
      } as unknown as Raycaster,
    });
    bridge.enable();

    let hostPresses = 0;
    document.body.addEventListener("pointerdown", () => hostPresses += 1);
    canvas.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 50, clientY: 50, pointerId: 1 }));

    expect(hostPresses).toBe(0);
    bridge.dispose();
  });
});
