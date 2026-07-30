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
}

const FOCUSABLE_SELECTOR =
  'input, textarea, select, button, a[href], [contenteditable=""], [contenteditable="true"], [tabindex]';

/** Finds the nearest focusable/editable element at or above `element`, for real focus transfer. */
export function findFocusableTarget(element: HTMLElement): HTMLElement | null {
  const closest = element.closest<HTMLElement>(FOCUSABLE_SELECTOR);
  if (!closest) return null;
  if (closest.hasAttribute("disabled")) return null;
  return closest;
}
