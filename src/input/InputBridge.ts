import { Camera, Mesh, Raycaster, Vector2 } from "three";
import { captureHitTestSnapshot, hitTestSnapshot, type HitCandidate } from "./hitTest";
import { forwardKeyboardEvent } from "./keyboardForwarding";
import { findFocusableTarget, forwardPointerEvent, type ForwardablePointerType } from "./pointerForwarding";

export type KeyboardMode = "focus-transfer" | "synthetic";

export interface InputBridgeOptions {
  camera: Camera;
  /** Usually the renderer's canvas (renderer.domElement). Pointer/wheel listeners attach here. */
  domElement: HTMLElement;
  mesh: Mesh;
  root: HTMLElement;
  raycaster?: Raycaster;
  /**
   * "focus-transfer" (default): on pointerdown over a focusable/editable target, calls a
   * real element.focus() — native keyboard/IME/selection then works with zero further
   * synthesis. "synthetic": forwards keydown/keyup as synthetic KeyboardEvents instead,
   * for a host that must keep OS focus pinned elsewhere (e.g. camera hotkeys while merely
   * hovering a screen); best-effort only, IME composition is unreliable under this mode.
   */
  keyboardMode?: KeyboardMode;
  /** Max age (ms) before the cached hit-test snapshot is recaptured. Default 50ms. */
  snapshotMaxAgeMs?: number;
}

/**
 * Bridges pointer/keyboard input from the 3D scene into a live, off-screen DOM root:
 * raycast -> UV -> root-local pixel coordinates -> geometry-based hit-test -> synthetic
 * event dispatch, with real focus transfer for text input. This is what makes the
 * render-to-texture pipeline fully interactive without an iframe or a DOM overlay.
 */
export class InputBridge {
  private readonly camera: Camera;
  private readonly domElement: HTMLElement;
  private readonly mesh: Mesh;
  private readonly root: HTMLElement;
  private readonly raycaster: Raycaster;
  private readonly keyboardMode: KeyboardMode;
  private readonly snapshotMaxAgeMs: number;
  private readonly ndc = new Vector2();

  private snapshot: HitCandidate[] = [];
  private snapshotAt = 0;
  private lastTarget: HTMLElement | null = null;
  private lastLocalX = 0;
  private lastLocalY = 0;
  private enabled = false;
  private focusedElement: HTMLElement | null = null;
  private pressedTarget: HTMLElement | null = null;
  private pressedPointerId: number | null = null;

  constructor(options: InputBridgeOptions) {
    this.camera = options.camera;
    this.domElement = options.domElement;
    this.mesh = options.mesh;
    this.root = options.root;
    this.raycaster = options.raycaster ?? new Raycaster();
    this.keyboardMode = options.keyboardMode ?? "focus-transfer";
    this.snapshotMaxAgeMs = options.snapshotMaxAgeMs ?? 50;

    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
    this.onPointerCancel = this.onPointerCancel.bind(this);
    this.onWheel = this.onWheel.bind(this);
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
  }

  enable(): void {
    if (this.enabled) return;
    this.enabled = true;
    this.domElement.addEventListener("pointerdown", this.onPointerDown);
    this.domElement.addEventListener("pointermove", this.onPointerMove);
    this.domElement.addEventListener("pointerup", this.onPointerUp);
    this.domElement.addEventListener("pointercancel", this.onPointerCancel);
    this.domElement.addEventListener("wheel", this.onWheel, { passive: false });
    if (this.keyboardMode === "synthetic") {
      document.addEventListener("keydown", this.onKeyDown);
      document.addEventListener("keyup", this.onKeyUp);
    }
  }

  disable(): void {
    if (!this.enabled) return;
    this.enabled = false;
    this.domElement.removeEventListener("pointerdown", this.onPointerDown);
    this.domElement.removeEventListener("pointermove", this.onPointerMove);
    this.domElement.removeEventListener("pointerup", this.onPointerUp);
    this.domElement.removeEventListener("pointercancel", this.onPointerCancel);
    this.domElement.removeEventListener("wheel", this.onWheel);
    document.removeEventListener("keydown", this.onKeyDown);
    document.removeEventListener("keyup", this.onKeyUp);
  }

  get focused(): boolean {
    return this.focusedElement !== null;
  }

  focus(): void {
    this.focusedElement?.focus({ preventScroll: true });
  }

  blur(): void {
    this.focusedElement?.blur();
    this.focusedElement = null;
  }

  dispose(): void {
    this.disable();
  }

  /** Forces a fresh hit-test snapshot on the next event rather than waiting out the cache age. */
  invalidateSnapshot(): void {
    this.snapshotAt = 0;
  }

  /** Public so a caller with its own raycast setup can drive the bridge directly. */
  handleHit(uv: Vector2, type: ForwardablePointerType, nativeEvent: PointerEvent | WheelEvent): HTMLElement | null {
    const rootRect = this.root.getBoundingClientRect();
    const localX = uv.x * rootRect.width;
    const localY = (1 - uv.y) * rootRect.height;
    this.lastLocalX = localX;
    this.lastLocalY = localY;

    const target = hitTestSnapshot(this.ensureSnapshot(), localX, localY);
    this.lastTarget = target;
    if (!target) return null;

    forwardPointerEvent({ root: this.root, target, type, localX, localY, nativeEvent });

    if (type === "pointerdown") {
      const focusable = findFocusableTarget(target);
      if (focusable) {
        // The real pointerdown landed on the renderer's canvas, not this (deliberately
        // hidden) element — left to the browser's default mousedown handling, focusing a
        // non-focusable canvas blurs whatever we just focus()'d right back to <body>.
        // Preventing default suppresses that native focus-stealing.
        nativeEvent.preventDefault();
        this.focusedElement = focusable;
        focusable.focus({ preventScroll: true });
      } else {
        this.blur();
      }
    }

    return target;
  }

  private ensureSnapshot(): HitCandidate[] {
    const now = performance.now();
    if (now - this.snapshotAt > this.snapshotMaxAgeMs) {
      this.snapshot = captureHitTestSnapshot(this.root);
      this.snapshotAt = now;
    }
    return this.snapshot;
  }

  private raycastUv(nativeEvent: MouseEvent): Vector2 | null {
    const rect = this.domElement.getBoundingClientRect();
    this.ndc.set(
      ((nativeEvent.clientX - rect.left) / rect.width) * 2 - 1,
      -((nativeEvent.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const [hit] = this.raycaster.intersectObject(this.mesh, false);
    return hit?.uv ?? null;
  }

  private onPointerDown(event: PointerEvent): void {
    const uv = this.raycastUv(event);
    if (!uv) {
      this.blur();
      return;
    }
    this.pressedTarget = this.handleHit(uv, "pointerdown", event);
    this.pressedPointerId = this.pressedTarget ? event.pointerId : null;
    if (this.pressedTarget) this.domElement.setPointerCapture(event.pointerId);
  }

  private onPointerMove(event: PointerEvent): void {
    const uv = this.raycastUv(event);
    if (!uv) return;
    this.handleHit(uv, "pointermove", event);
  }

  private onPointerUp(event: PointerEvent): void {
    if (event.pointerId !== this.pressedPointerId) return;
    const pressedTarget = this.pressedTarget;
    this.pressedTarget = null;
    this.pressedPointerId = null;
    if (this.domElement.hasPointerCapture(event.pointerId)) this.domElement.releasePointerCapture(event.pointerId);
    const uv = this.raycastUv(event);
    if (!uv) {
      if (pressedTarget) this.forwardToPressedTarget(pressedTarget, "pointerup", event);
      return;
    }
    const upTarget = this.handleHit(uv, "pointerup", event);
    if (pressedTarget && upTarget === pressedTarget) {
      forwardPointerEvent({
        root: this.root,
        target: pressedTarget,
        type: "click",
        localX: this.lastLocalX,
        localY: this.lastLocalY,
        nativeEvent: event,
      });
    }
  }

  private onPointerCancel(event: PointerEvent): void {
    if (event.pointerId !== this.pressedPointerId) return;
    const pressedTarget = this.pressedTarget;
    this.pressedTarget = null;
    this.pressedPointerId = null;
    if (this.domElement.hasPointerCapture(event.pointerId)) this.domElement.releasePointerCapture(event.pointerId);
    if (pressedTarget) this.forwardToPressedTarget(pressedTarget, "pointercancel", event);
  }

  private forwardToPressedTarget(
    target: HTMLElement,
    type: "pointerup" | "pointercancel",
    nativeEvent: PointerEvent,
  ): void {
    forwardPointerEvent({
      root: this.root,
      target,
      type,
      localX: this.lastLocalX,
      localY: this.lastLocalY,
      nativeEvent,
    });
  }

  private onWheel(event: WheelEvent): void {
    const uv = this.raycastUv(event);
    if (!uv) return;
    event.preventDefault();
    this.handleHit(uv, "wheel", event);
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (!this.focused) return;
    forwardKeyboardEvent(this.activeTargetWithinRoot(), event);
  }

  private onKeyUp(event: KeyboardEvent): void {
    if (!this.focused) return;
    forwardKeyboardEvent(this.activeTargetWithinRoot(), event);
  }

  private activeTargetWithinRoot(): EventTarget {
    return this.root.contains(document.activeElement) ? (document.activeElement as EventTarget) : this.root;
  }
}
