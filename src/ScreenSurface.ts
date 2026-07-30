import type { Mesh } from "three";
import { DomCompositor, type CompositorOptions } from "./compositor/DomCompositor";
import { InputBridge, type InputBridgeOptions } from "./input/InputBridge";
import { ScreenTexture, type ScreenTextureOptions } from "./texture/ScreenTexture";
import type { DetailLevel } from "./types";
import type { RafScheduler } from "./utils/raf-scheduler";

export type ScreenSurfaceInputOptions = Omit<InputBridgeOptions, "mesh" | "root">;

export interface ScreenSurfaceOptions {
  id: string;
  mesh: Mesh;
  /** Live, connected, laid-out DOM subtree to display and forward input into. */
  root: HTMLElement;
  /** Compositor canvas resolution; independent of root's real DOM layout size. */
  resolution: { width: number; height: number };
  compositor?: Partial<Omit<CompositorOptions, "root" | "width" | "height" | "scheduler">>;
  texture?: Partial<Omit<ScreenTextureOptions, "mesh">>;
  /** Pass `false` to render-only, with no pointer/keyboard forwarding. */
  input?: ScreenSurfaceInputOptions | false;
  /** Injected by ScreenSurfaceRegistry so every screen's compositor shares one rAF loop. */
  scheduler?: RafScheduler;
}

const REDUCED_FPS_CAP = 15;

/**
 * Facade tying one mesh to one live DOM root: compositor (rasterization) + screenTexture
 * (CanvasTexture wiring) + input (raycast/hit-test/dispatch bridge).
 */
export class ScreenSurface {
  readonly id: string;
  readonly mesh: Mesh;
  readonly compositor: DomCompositor;
  readonly screenTexture: ScreenTexture;
  readonly input?: InputBridge;

  private readonly fullFps: number;
  private readonly unsubscribeFrame: () => void;
  private detailLevel: DetailLevel = "full";

  constructor(options: ScreenSurfaceOptions) {
    this.id = options.id;
    this.mesh = options.mesh;
    this.fullFps = options.compositor?.fps ?? 24;

    this.compositor = new DomCompositor({
      ...options.compositor,
      root: options.root,
      width: options.resolution.width,
      height: options.resolution.height,
      fps: this.fullFps,
      scheduler: options.scheduler,
    });

    this.screenTexture = new ScreenTexture(this.compositor.canvas, { ...options.texture, mesh: this.mesh });
    this.screenTexture.attach();
    this.unsubscribeFrame = this.compositor.onFrame(() => {
      this.screenTexture.ensureAttached();
      this.screenTexture.markDirty();
    });

    if (options.input !== false && options.input) {
      this.input = new InputBridge({
        ...options.input,
        mesh: this.mesh,
        root: options.root,
        onScroll: () => {
          options.input && options.input.onScroll?.();
          this.compositor.requestRedraw();
        },
        onInteraction: () => {
          options.input && options.input.onInteraction?.();
          this.compositor.requestRedraw();
        },
      });
      this.input.enable();
    }
  }

  start(): void {
    this.compositor.start();
  }

  stop(): void {
    this.compositor.stop();
  }

  get detail(): DetailLevel {
    return this.detailLevel;
  }

  /** Generalizes OperatorOS's binary MAX_LIVE_SCREENS cutoff into continuous degradation. */
  setDetail(level: DetailLevel): void {
    if (this.detailLevel === level) return;
    this.detailLevel = level;
    if (level === "frozen") {
      this.compositor.stop();
      return;
    }
    this.compositor.setFps(level === "reduced" ? Math.min(this.fullFps, REDUCED_FPS_CAP) : this.fullFps);
    this.compositor.start();
  }

  dispose(): void {
    this.unsubscribeFrame();
    this.input?.dispose();
    this.screenTexture.dispose();
    this.compositor.dispose();
  }
}
