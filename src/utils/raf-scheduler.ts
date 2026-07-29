export type FrameCallback = (now: number, deltaMs: number) => void;

/**
 * Single shared requestAnimationFrame loop with per-subscriber fps gating.
 * Avoids each ScreenSurface running its own rAF loop (which would interleave
 * DOM reads/writes across screens and cause layout thrash).
 */
export class RafScheduler {
  private subscribers = new Map<symbol, { fps: number; last: number; cb: FrameCallback }>();
  private rafHandle: number | null = null;
  private readonly requestFrame: (cb: FrameRequestCallback) => number;
  private readonly cancelFrame: (handle: number) => void;

  constructor(options?: {
    requestFrame?: (cb: FrameRequestCallback) => number;
    cancelFrame?: (handle: number) => void;
  }) {
    this.requestFrame = options?.requestFrame ?? ((cb) => requestAnimationFrame(cb));
    this.cancelFrame = options?.cancelFrame ?? ((handle) => cancelAnimationFrame(handle));
  }

  subscribe(cb: FrameCallback, fps = 30): () => void {
    const key = Symbol("raf-subscriber");
    this.subscribers.set(key, { fps, last: 0, cb });
    this.ensureLoop();
    return () => {
      this.subscribers.delete(key);
      if (this.subscribers.size === 0) this.stopLoop();
    };
  }

  setFps(cb: FrameCallback, fps: number): void {
    for (const entry of this.subscribers.values()) {
      if (entry.cb === cb) entry.fps = fps;
    }
  }

  private ensureLoop(): void {
    if (this.rafHandle !== null) return;
    const tick = (now: number) => {
      for (const entry of this.subscribers.values()) {
        const interval = entry.fps > 0 ? 1000 / entry.fps : Infinity;
        const elapsed = now - entry.last;
        if (elapsed >= interval) {
          const delta = entry.last === 0 ? interval : elapsed;
          entry.last = now;
          entry.cb(now, delta);
        }
      }
      this.rafHandle = this.requestFrame(tick);
    };
    this.rafHandle = this.requestFrame(tick);
  }

  private stopLoop(): void {
    if (this.rafHandle !== null) {
      this.cancelFrame(this.rafHandle);
      this.rafHandle = null;
    }
  }

  dispose(): void {
    this.subscribers.clear();
    this.stopLoop();
  }
}
