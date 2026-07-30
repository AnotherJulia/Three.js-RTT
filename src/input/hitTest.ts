import type { Rect } from "../utils/rect";

export interface HitCandidate {
  element: HTMLElement;
  rect: Rect;
  /**
   * Explicit z-index values of the stacking contexts that contain this node,
   * outermost first. A child must never escape the z-order of its window.
   */
  stackingOrder: number[];
  documentOrder: number;
}

function stackingOrderFor(element: HTMLElement, root: HTMLElement): number[] {
  const order: number[] = [];
  let current: HTMLElement | null = element;

  while (current && current !== root) {
    const style = getComputedStyle(current);
    const zIndex = Number.parseInt(style.zIndex, 10);
    if (style.position !== "static" && !Number.isNaN(zIndex)) order.unshift(zIndex);
    current = current.parentElement;
  }

  return order;
}

function compareStackingOrder(a: readonly number[], b: readonly number[]): number {
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const left = a[index]!;
    const right = b[index]!;
    if (left !== right) return left - right;
  }
  // A descendant stacking context paints above its parent's normal content.
  return a.length - b.length;
}

/**
 * Snapshots hit-testable elements once (batched getBoundingClientRect reads), so
 * per-pointer-event hit-testing during a compositor tick interval is pure math with
 * no further layout reads. Rebuilt once per compositor tick alongside the live-element
 * rect pass — both are "read" work batched ahead of any canvas "write" work.
 *
 * Deliberately does NOT use document.elementFromPoint: `root` is not necessarily
 * positioned where the real OS cursor is (it may sit behind the WebGL canvas, off the
 * interactive viewport in spirit even though technically laid out), so hit-testing is
 * done entirely by rect containment against this snapshot instead.
 */
export function captureHitTestSnapshot(root: HTMLElement): HitCandidate[] {
  const rootRect = root.getBoundingClientRect();
  const candidates: HitCandidate[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  let documentOrder = 0;
  let node = walker.nextNode() as HTMLElement | null;

  while (node) {
    const style = getComputedStyle(node);
    if (style.pointerEvents !== "none" && style.visibility !== "hidden" && style.display !== "none") {
      const elRect = node.getBoundingClientRect();
      if (elRect.width > 0 && elRect.height > 0) {
        candidates.push({
          element: node,
          rect: {
            left: elRect.left - rootRect.left,
            top: elRect.top - rootRect.top,
            width: elRect.width,
            height: elRect.height,
          },
          stackingOrder: stackingOrderFor(node, root),
          documentOrder: documentOrder++,
        });
      }
    }
    node = walker.nextNode() as HTMLElement | null;
  }

  return candidates;
}

/**
 * Picks the topmost element at (x, y) in root-local pixel coordinates.
 * Heuristic (v1, documented limitation — does not resolve full CSS stacking contexts):
 * higher explicit z-index wins; among ties, the smallest-area (most specific/deepest
 * leaf-like) match wins; among further ties, later document order wins.
 */
export function hitTestSnapshot(snapshot: readonly HitCandidate[], x: number, y: number): HTMLElement | null {
  let best: HitCandidate | null = null;

  for (const candidate of snapshot) {
    const { rect } = candidate;
    const contains = x >= rect.left && x <= rect.left + rect.width && y >= rect.top && y <= rect.top + rect.height;
    if (!contains) continue;

    if (!best) {
      best = candidate;
      continue;
    }

    const stackingComparison = compareStackingOrder(candidate.stackingOrder, best.stackingOrder);
    if (stackingComparison !== 0) {
      if (stackingComparison > 0) best = candidate;
      continue;
    }

    const candidateArea = rect.width * rect.height;
    const bestArea = best.rect.width * best.rect.height;
    if (candidateArea < bestArea) {
      best = candidate;
    } else if (candidateArea === bestArea && candidate.documentOrder > best.documentOrder) {
      best = candidate;
    }
  }

  return best?.element ?? null;
}
