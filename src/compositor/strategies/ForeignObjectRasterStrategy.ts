import type { RasterFrame, RasterStrategy } from "../../types";
import { DEFAULT_STYLE_PROPERTIES } from "./style-allowlist";

export interface ForeignObjectRasterStrategyOptions {
  /** Selector for elements excluded from SVG serialization and left as blank placeholders
   * (the DomCompositor draws these directly instead — see liveElementOverlay). */
  liveElementSelector?: string;
  /** Curated CSS properties copied per node. Defaults to a visual/inherited subset. */
  styleProperties?: readonly string[];
}

/**
 * Rasterizes a live DOM subtree via clone -> inline computed styles -> SVG
 * foreignObject -> Image -> canvas. Same-origin, no iframe, no external
 * capture permission needed. <video>/<canvas> descendants are excluded here
 * (foreignObject rendering of them is blank/unreliable across browsers) and
 * are instead composited directly by the caller every tick.
 */
export class ForeignObjectRasterStrategy implements RasterStrategy {
  private root: HTMLElement | null = null;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private readonly liveElementSelector: string;
  private readonly styleProperties: readonly string[];

  constructor(options: ForeignObjectRasterStrategyOptions = {}) {
    this.liveElementSelector = options.liveElementSelector ?? "video, canvas";
    this.styleProperties = options.styleProperties ?? DEFAULT_STYLE_PROPERTIES;
    this.canvas = document.createElement("canvas");
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("[Three.js-RTT] 2D canvas context unavailable");
    this.ctx = ctx;
  }

  attach(root: HTMLElement, width: number, height: number): void {
    this.root = root;
    this.resize(width, height);
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.canvas.width = width;
    this.canvas.height = height;
  }

  async capture(): Promise<RasterFrame> {
    if (!this.root) throw new Error("[Three.js-RTT] ForeignObjectRasterStrategy not attached");
    const svgMarkup = this.serialize(this.root);
    const image = new Image();
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`;
    await image.decode();
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.ctx.drawImage(image, 0, 0, this.width, this.height);
    return { canvas: this.canvas, width: this.width, height: this.height };
  }

  detach(): void {
    this.root = null;
  }

  private serialize(root: HTMLElement): string {
    const clone = root.cloneNode(true) as HTMLElement;
    this.inlineStyles(root, clone);
    this.blankLiveElements(clone);
    const markup = new XMLSerializer().serializeToString(clone);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${this.width}" height="${this.height}"><foreignObject width="100%" height="100%">${markup}</foreignObject></svg>`;
  }

  private inlineStyles(source: Element, target: HTMLElement): void {
    const computed = getComputedStyle(source);
    for (const property of this.styleProperties) {
      const value = computed.getPropertyValue(toKebabCase(property));
      if (value) target.style.setProperty(toKebabCase(property), value);
    }
    const sourceChildren = Array.from(source.children);
    const targetChildren = Array.from(target.children);
    for (let i = 0; i < sourceChildren.length; i += 1) {
      const sourceChild = sourceChildren[i];
      const targetChild = targetChildren[i];
      if (sourceChild && targetChild instanceof HTMLElement) {
        this.inlineStyles(sourceChild, targetChild);
      }
    }
  }

  private blankLiveElements(clone: HTMLElement): void {
    const liveElements = clone.querySelectorAll(this.liveElementSelector);
    for (const element of Array.from(liveElements)) {
      const placeholder = document.createElement("div");
      placeholder.style.cssText = element.getAttribute("style") ?? "";
      const rect = element.getBoundingClientRect();
      placeholder.style.width = `${rect.width}px`;
      placeholder.style.height = `${rect.height}px`;
      element.replaceWith(placeholder);
    }
  }
}

function toKebabCase(property: string): string {
  return property.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
}
