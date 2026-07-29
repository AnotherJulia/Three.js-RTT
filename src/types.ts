export interface RasterFrame {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
}

export interface RasterStrategy {
  /** Prepare the strategy for a given live DOM root and target resolution. */
  attach(root: HTMLElement, width: number, height: number): void;
  /** Produce one rasterized frame of the current DOM state. May be async (image decode). */
  capture(): Promise<RasterFrame>;
  /** Update target resolution without a full re-attach. */
  resize(width: number, height: number): void;
  detach(): void;
}

export type DirtyMode = "always" | "mutation-observer" | (() => boolean);

export type DetailLevel = "full" | "reduced" | "frozen";
