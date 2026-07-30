import type { DirtyMode, RasterStrategy } from "../types";
import { RafScheduler } from "../utils/raf-scheduler";
import { DirtyTracker, findLiveElements } from "./dirtyTracking";
import { ForeignObjectRasterStrategy } from "./strategies/ForeignObjectRasterStrategy";

export interface CompositorOptions {
  /** Live, connected, laid-out DOM subtree to rasterize. Must not be display:none. */
  root: HTMLElement;
  width: number;
  height: number;
  /** Ticks per second. Default 24; the focused/interactive screen can go up to 60. */
  fps?: number;
  strategy?: RasterStrategy;
  /** Default "mutation-observer": skip the expensive base-layer rasterization when the
   * DOM subtree hasn't structurally changed. Live <video>/<canvas> overlay always redraws. */
  dirty?: DirtyMode;
  /** Selector for elements composited directly instead of via SVG rasterization. */
  liveElementSelector?: string;
  /** Shared scheduler (injected by ScreenSurfaceRegistry) or a private one per compositor. */
  scheduler?: RafScheduler;
  /** Called when a raster capture fails; the previous successful frame remains visible. */
  onCaptureError?: (error: unknown) => void;
}

/**
 * Continuously rasterizes a live DOM subtree into a <canvas> suitable for use as a
 * THREE.CanvasTexture source. Two layers per tick:
 *  - base layer: SVG-foreignObject rasterization of everything except <video>/<canvas>,
 *    skipped when the dirty tracker reports no structural change since the last tick.
 *  - live-element overlay: direct drawImage() of <video>/<canvas> descendants every tick,
 *    since neither fires DOM mutations for their own playback.
 */
export class DomCompositor {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly baseCanvas: HTMLCanvasElement;
  private readonly baseCtx: CanvasRenderingContext2D;
  private readonly root: HTMLElement;
  private readonly strategy: RasterStrategy;
  private readonly dirtyTracker: DirtyTracker;
  private readonly liveElementSelector: string;
  private readonly ownedScheduler: RafScheduler | null;
  private readonly scheduler: RafScheduler;
  private unsubscribe: (() => void) | null = null;
  private frameListeners = new Set<(canvas: HTMLCanvasElement) => void>();
  private width: number;
  private height: number;
  private fps: number;
  private captureInFlight = false;
  private lastCaptureMs = 0;
  private lastCaptureError: unknown = null;
  private readonly onCaptureError?: (error: unknown) => void;

  constructor(options: CompositorOptions) {
    this.root = options.root;
    this.width = options.width;
    this.height = options.height;
    this.fps = options.fps ?? 24;
    this.onCaptureError = options.onCaptureError;
    this.liveElementSelector = options.liveElementSelector ?? "video, canvas";
    this.strategy = options.strategy ?? new ForeignObjectRasterStrategy({ liveElementSelector: this.liveElementSelector });
    this.dirtyTracker = new DirtyTracker(this.root, options.dirty ?? "mutation-observer");

    this.canvas = document.createElement("canvas");
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("[Three.js-RTT] 2D canvas context unavailable");
    this.ctx = ctx;

    this.baseCanvas = document.createElement("canvas");
    this.baseCanvas.width = this.width;
    this.baseCanvas.height = this.height;
    const baseCtx = this.baseCanvas.getContext("2d");
    if (!baseCtx) throw new Error("[Three.js-RTT] 2D canvas context unavailable");
    this.baseCtx = baseCtx;

    this.strategy.attach(this.root, this.width, this.height);

    if (options.scheduler) {
      this.ownedScheduler = null;
      this.scheduler = options.scheduler;
    } else {
      this.ownedScheduler = new RafScheduler();
      this.scheduler = this.ownedScheduler;
    }
  }

  start(): void {
    if (this.unsubscribe) return;
    this.unsubscribe = this.scheduler.subscribe(() => {
      void this.tick();
    }, this.fps);
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  setFps(fps: number): void {
    this.fps = fps;
    if (this.unsubscribe) {
      this.stop();
      this.start();
    }
  }

  requestRedraw(): void {
    this.dirtyTracker.requestRedraw();
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.canvas.width = width;
    this.canvas.height = height;
    this.baseCanvas.width = width;
    this.baseCanvas.height = height;
    this.strategy.resize(width, height);
    this.dirtyTracker.requestRedraw();
  }

  onFrame(cb: (canvas: HTMLCanvasElement) => void): () => void {
    this.frameListeners.add(cb);
    return () => this.frameListeners.delete(cb);
  }

  /** Exposed so an external shared loop (ScreenSurfaceRegistry) can drive this compositor
   * instead of it running its own rAF subscription, if constructed without `start()`. */
  async tick(): Promise<void> {
    if (this.captureInFlight) return; // backpressure: skip rather than queue
    // CSS animations and transitions do not produce mutations.  Ask the browser
    // whether the base layer is currently animating so the default dirty mode
    // remains cheap for static DOM without freezing animated UI.
    const isDirty = this.dirtyTracker.isDirty() || this.hasRunningBaseAnimation();

    if (isDirty) {
      this.captureInFlight = true;
      try {
        const t0 = performance.now();
        const frame = await this.strategy.capture();
        this.lastCaptureMs = performance.now() - t0;
        this.baseCtx.clearRect(0, 0, this.width, this.height);
        this.baseCtx.drawImage(frame.canvas, 0, 0, this.width, this.height);
        this.dirtyTracker.markClean();
        this.lastCaptureError = null;
      } catch (error) {
        this.lastCaptureError = error;
        this.onCaptureError?.(error);
      } finally {
        this.captureInFlight = false;
      }
    }

    const liveElements = findLiveElements(this.root, this.liveElementSelector);
    // A static base with no live descendants is already resident in the texture;
    // avoid both a canvas copy and a GPU upload on its scheduled ticks.
    if (!isDirty && liveElements.length === 0) return;

    this.ctx.clearRect(0, 0, this.width, this.height);
    this.ctx.drawImage(this.baseCanvas, 0, 0);
    this.drawLiveElementOverlay(liveElements);
    this.publish();
  }

  get lastCaptureDurationMs(): number {
    return this.lastCaptureMs;
  }

  get lastError(): unknown {
    return this.lastCaptureError;
  }

  private drawLiveElementOverlay(liveElements: ReturnType<typeof findLiveElements>): void {
    const rootRect = this.root.getBoundingClientRect();
    if (rootRect.width <= 0 || rootRect.height <= 0) return;
    // Element geometry is measured in CSS pixels while the compositor may use
    // an independent raster resolution.
    this.ctx.save();
    this.ctx.scale(this.width / rootRect.width, this.height / rootRect.height);
    for (const { element, left, top, width, height, clip } of liveElements) {
      if (width <= 0 || height <= 0) continue;
      if (element instanceof HTMLVideoElement && element.readyState < element.HAVE_CURRENT_DATA) continue;

      this.ctx.save();
      if (clip) {
        this.ctx.beginPath();
        this.ctx.rect(clip.left, clip.top, clip.width, clip.height);
        this.ctx.clip();
      }
      try {
        this.ctx.drawImage(element, left, top, width, height);
      } catch {
        // Element not yet paintable (e.g. canvas with zero-size backing store); skip this tick.
      }
      this.ctx.restore();
    }
    this.ctx.restore();
  }

  private publish(): void {
    for (const cb of this.frameListeners) cb(this.canvas);
  }

  private hasRunningBaseAnimation(): boolean {
    if (typeof this.root.getAnimations !== "function") return false;
    return this.root.getAnimations({ subtree: true }).some((animation) => {
      if (animation.playState !== "running") return false;
      const target = (animation.effect as KeyframeEffect | null)?.target;
      return !(target instanceof Element) || !target.closest(this.liveElementSelector);
    });
  }

  dispose(): void {
    this.stop();
    this.strategy.detach();
    this.dirtyTracker.dispose();
    this.frameListeners.clear();
    this.ownedScheduler?.dispose();
  }
}
