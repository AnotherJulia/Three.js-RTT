export type ForwardablePointerType =
  | "pointerdown"
  | "pointermove"
  | "pointerup"
  | "pointercancel"
  | "pointerenter"
  | "pointerleave"
  | "click"
  | "wheel";

export interface ForwardPointerOptions {
  root: HTMLElement;
  target: HTMLElement;
  type: ForwardablePointerType;
  /** Root-local pixel coordinates (from the UV->pixel conversion). */
  localX: number;
  localY: number;
  nativeEvent: PointerEvent | MouseEvent | WheelEvent;
}

/**
 * Dispatches a real synthetic event at `target`, positioned at `target`'s actual page
 * coordinates (derived from root's real getBoundingClientRect + the local offset) so any
 * internal getBoundingClientRect()-based logic in the target app still resolves sanely.
 */
export function forwardPointerEvent(options: ForwardPointerOptions): void {
  const rootRect = options.root.getBoundingClientRect();
  const clientX = rootRect.left + options.localX;
  const clientY = rootRect.top + options.localY;
  const source = options.nativeEvent;

  if (options.type === "wheel") {
    const wheelSource = source as WheelEvent;
    options.target.dispatchEvent(
      new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        composed: true,
        clientX,
        clientY,
        deltaX: wheelSource.deltaX,
        deltaY: wheelSource.deltaY,
        deltaZ: wheelSource.deltaZ,
        deltaMode: wheelSource.deltaMode,
      }),
    );
    return;
  }

  const pointerSource = source as PointerEvent;
  const isPointerType = options.type.startsWith("pointer");
  const init: PointerEventInit = {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX,
    clientY,
    button: (source as MouseEvent).button ?? 0,
    buttons: (source as MouseEvent).buttons ?? 0,
    pointerId: pointerSource.pointerId ?? 1,
    pointerType: pointerSource.pointerType ?? "mouse",
    isPrimary: true,
  };

  const event =
    isPointerType && typeof PointerEvent !== "undefined"
      ? new PointerEvent(options.type, init)
      : new MouseEvent(options.type, init);
  options.target.dispatchEvent(event);

  // Dispatch the matching compatibility mouse event too. Browsers emit both
  // families for a mouse pointer, but constructing a synthetic PointerEvent
  // does not automatically create mouse events. This keeps existing React
  // `onMouse*` controls working alongside `onPointer*` controls.
  const mouseType = mouseEventTypeFor(options.type);
  if (mouseType) options.target.dispatchEvent(new MouseEvent(mouseType, init));
}

function mouseEventTypeFor(type: ForwardablePointerType): "mousedown" | "mousemove" | "mouseup" | null {
  if (type === "pointerdown") return "mousedown";
  if (type === "pointermove") return "mousemove";
  if (type === "pointerup") return "mouseup";
  return null;
}

/**
 * Applies the browser's normal wheel-scroll behavior inside an off-screen root.
 * Synthetic WheelEvents intentionally do not trigger a default scroll action, so
 * the input bridge performs that small piece of native behavior itself.
 */
export function scrollNearestAncestor(
  root: HTMLElement,
  target: HTMLElement,
  wheelEvent: WheelEvent,
): boolean {
  let element: HTMLElement | null = target;

  while (element && root.contains(element)) {
    const style = getComputedStyle(element);
    const deltaX = wheelDeltaInPixels(wheelEvent, element, "x");
    const deltaY = wheelDeltaInPixels(wheelEvent, element, "y");
    const maxLeft = element.scrollWidth - element.clientWidth;
    const maxTop = element.scrollHeight - element.clientHeight;
    const canScrollX =
      maxLeft > 0 &&
      (style.overflowX === "auto" || style.overflowX === "scroll" || style.overflowX === "overlay") &&
      ((deltaX < 0 && element.scrollLeft > 0) || (deltaX > 0 && element.scrollLeft < maxLeft));
    const canScrollY =
      maxTop > 0 &&
      (style.overflowY === "auto" || style.overflowY === "scroll" || style.overflowY === "overlay") &&
      ((deltaY < 0 && element.scrollTop > 0) || (deltaY > 0 && element.scrollTop < maxTop));

    if (canScrollX || canScrollY) {
      if (canScrollX) element.scrollLeft += deltaX;
      if (canScrollY) element.scrollTop += deltaY;
      return true;
    }

    if (element === root) break;
    element = element.parentElement;
  }

  return false;
}

function wheelDeltaInPixels(event: WheelEvent, element: HTMLElement, axis: "x" | "y"): number {
  const value = axis === "x" ? event.deltaX : event.deltaY;
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return value * 16;
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    return value * (axis === "x" ? element.clientWidth : element.clientHeight);
  }
  return value;
}

const FOCUSABLE_SELECTOR =
  'input, textarea, select, button, a[href], [contenteditable=""], [contenteditable="true"], [tabindex]';

const ACTIVATION_SELECTOR =
  'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [contenteditable=""], [contenteditable="true"], [role="button"], [role="menuitem"], [role="option"]';

/**
 * Promotes a visual child such as an icon or label to the control that owns it.
 * Pointer hit-testing legitimately finds those small visual children first, but
 * browser activation is defined on their nearest semantic control.
 */
export function findActivationTarget(element: HTMLElement): HTMLElement {
  return element.closest<HTMLElement>(ACTIVATION_SELECTOR) ?? element;
}

/** Finds the nearest focusable/editable element at or above `element`, for real focus transfer. */
export function findFocusableTarget(element: HTMLElement): HTMLElement | null {
  const closest = element.closest<HTMLElement>(FOCUSABLE_SELECTOR);
  if (!closest) return null;
  if (closest.hasAttribute("disabled")) return null;
  return closest;
}
