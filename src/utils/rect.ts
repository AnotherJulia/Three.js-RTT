export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function rectFromDomRect(domRect: DOMRect): Rect {
  return { left: domRect.left, top: domRect.top, width: domRect.width, height: domRect.height };
}

export function relativeRect(rect: Rect, origin: Rect): Rect {
  return {
    left: rect.left - origin.left,
    top: rect.top - origin.top,
    width: rect.width,
    height: rect.height,
  };
}

export function rectContains(rect: Rect, x: number, y: number): boolean {
  return x >= rect.left && x <= rect.left + rect.width && y >= rect.top && y <= rect.top + rect.height;
}

export function intersectRect(a: Rect, b: Rect): Rect | null {
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const right = Math.min(a.left + a.width, b.left + b.width);
  const bottom = Math.min(a.top + a.height, b.top + b.height);
  if (right <= left || bottom <= top) return null;
  return { left, top, width: right - left, height: bottom - top };
}
