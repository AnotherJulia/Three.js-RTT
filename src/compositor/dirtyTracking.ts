import type { DirtyMode } from "../types";
import { intersectRect, type Rect } from "../utils/rect";

/**
 * Tracks whether a DOM subtree's *structure/attributes/text* changed since the
 * last check. Deliberately does not fire for CSS animations/transitions (those
 * don't mutate the DOM) or for <video>/<canvas> playback (same reason) — the
 * compositor treats those as "always redraw the live-element overlay,
 * conditionally redraw the base layer" precisely because of this split.
 */
export class DirtyTracker {
  private dirty = true;
  /** Advances for every change so an async capture cannot clear a newer DOM. */
  private revision = 0;
  private observer: MutationObserver | null = null;
  private readonly mode: DirtyMode;

  constructor(root: HTMLElement, mode: DirtyMode = "mutation-observer") {
    this.mode = mode;
    if (mode === "mutation-observer") {
      this.observer = new MutationObserver(() => {
        this.dirty = true;
        this.revision += 1;
      });
      this.observer.observe(root, {
        subtree: true,
        childList: true,
        attributes: true,
        characterData: true,
      });
    }
  }

  isDirty(): boolean {
    if (this.mode === "always") return true;
    if (typeof this.mode === "function") return this.mode();
    return this.dirty;
  }

  /** Snapshot the current revision before beginning asynchronous work. */
  getRevision(): number {
    return this.revision;
  }

  /**
   * Clears the dirty flag only when nothing changed while work was in flight.
   * A React root commonly replaces its login tree with its desktop tree during
   * an image decode; treating that newer mutation as clean leaves the old (or
   * blank) texture permanently resident.
   */
  markClean(capturedRevision?: number): void {
    if (capturedRevision !== undefined && capturedRevision !== this.revision) return;
    this.dirty = false;
  }

  requestRedraw(): void {
    this.dirty = true;
    this.revision += 1;
  }

  dispose(): void {
    this.observer?.disconnect();
    this.observer = null;
  }
}

export interface LiveElementRect {
  element: HTMLVideoElement | HTMLCanvasElement;
  left: number;
  top: number;
  width: number;
  height: number;
  clip: { left: number; top: number; width: number; height: number } | null;
}

/**
 * Finds every live <video>/<canvas> descendant and computes its root-relative
 * rect plus the intersection of every clipping/scrolling ancestor
 * (a v1 clipping approximation — exact clip-path/border-radius is not handled).
 */
export function findLiveElements(root: HTMLElement, selector = "video, canvas"): LiveElementRect[] {
  const rootRect = root.getBoundingClientRect();
  const elements = Array.from(root.querySelectorAll<HTMLVideoElement | HTMLCanvasElement>(selector));

  return elements.map((element) => {
    const elRect = element.getBoundingClientRect();
    const left = elRect.left - rootRect.left;
    const top = elRect.top - rootRect.top;

    let clip: Rect | null = { left: 0, top: 0, width: rootRect.width, height: rootRect.height };
    let ancestor = element.parentElement;
    while (ancestor && ancestor !== root.parentElement) {
      const style = getComputedStyle(ancestor);
      const clipsX = clipsOverflow(style.overflowX || ancestor.style.overflowX || style.overflow || ancestor.style.overflow);
      const clipsY = clipsOverflow(style.overflowY || ancestor.style.overflowY || style.overflow || ancestor.style.overflow);
      if (clipsX || clipsY) {
        const ancestorRect = ancestor.getBoundingClientRect();
        const ancestorClip = {
          left: clipsX ? ancestorRect.left - rootRect.left : 0,
          top: clipsY ? ancestorRect.top - rootRect.top : 0,
          width: clipsX ? ancestorRect.width : rootRect.width,
          height: clipsY ? ancestorRect.height : rootRect.height,
        };
        clip = clip && intersectRect(clip, ancestorClip);
        if (!clip) break;
      }
      ancestor = ancestor.parentElement;
    }

    return { element, left, top, width: elRect.width, height: elRect.height, clip };
  });
}

function clipsOverflow(value: string): boolean {
  return value === "hidden" || value === "scroll" || value === "auto" || value === "clip";
}
