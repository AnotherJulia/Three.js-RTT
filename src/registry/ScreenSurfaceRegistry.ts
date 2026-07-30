import type { Matrix4 } from "three";
import { ScreenSurface, type ScreenSurfaceOptions } from "../ScreenSurface";
import { RafScheduler } from "../utils/raf-scheduler";
import type { ScreenSurfaceRegistryEventName, ScreenSurfaceRegistryEvents } from "./events";

/**
 * Registers/tracks N independent ScreenSurfaces and shares one rAF loop across all of
 * their compositors (avoids N independent per-screen loops). Deliberately carries no
 * "spanned single desktop" policy (ordering, leadership election, etc.) — that stays
 * application-side, same split OperatorOS/GridLinkOS already use today.
 */
export class ScreenSurfaceRegistry {
  private readonly screens = new Map<string, ScreenSurface>();
  private readonly scheduler = new RafScheduler();
  private readonly listeners: {
    [K in ScreenSurfaceRegistryEventName]: Set<(payload: ScreenSurfaceRegistryEvents[K]) => void>;
  } = {
    registered: new Set(),
    unregistered: new Set(),
    focuschange: new Set(),
  };
  private focused: string | null = null;

  register(options: Omit<ScreenSurfaceOptions, "scheduler">): ScreenSurface {
    if (this.screens.has(options.id)) {
      throw new Error(`[Three.js-RTT] screen "${options.id}" is already registered`);
    }
    const screen = new ScreenSurface({ ...options, scheduler: this.scheduler });
    screen.start();
    this.screens.set(options.id, screen);
    this.emit("registered", { screen });
    return screen;
  }

  unregister(id: string): void {
    const screen = this.screens.get(id);
    if (!screen) return;
    screen.dispose();
    this.screens.delete(id);
    if (this.focused === id) this.setFocused(null);
    this.emit("unregistered", { id });
  }

  get(id: string): ScreenSurface | undefined {
    return this.screens.get(id);
  }

  list(): ScreenSurface[] {
    return Array.from(this.screens.values());
  }

  /** Pure data for app-level multi-monitor policy (ordering, spanned-desktop layout, etc). */
  worldTransformsSnapshot(): Array<{ id: string; matrixWorld: Matrix4 }> {
    return this.list().map((screen) => ({ id: screen.id, matrixWorld: screen.mesh.matrixWorld.clone() }));
  }

  setFocused(id: string | null): void {
    if (id !== null && !this.screens.has(id)) {
      throw new Error(`[Three.js-RTT] cannot focus unregistered screen "${id}"`);
    }
    if (this.focused === id) return;
    this.focused = id;
    this.emit("focuschange", { id });
  }

  get focusedId(): string | null {
    return this.focused;
  }

  on<K extends ScreenSurfaceRegistryEventName>(
    event: K,
    cb: (payload: ScreenSurfaceRegistryEvents[K]) => void,
  ): () => void {
    this.listeners[event].add(cb as (payload: ScreenSurfaceRegistryEvents[typeof event]) => void);
    return () => this.listeners[event].delete(cb as (payload: ScreenSurfaceRegistryEvents[typeof event]) => void);
  }

  private emit<K extends ScreenSurfaceRegistryEventName>(event: K, payload: ScreenSurfaceRegistryEvents[K]): void {
    for (const cb of this.listeners[event]) cb(payload);
  }

  disposeAll(): void {
    for (const id of Array.from(this.screens.keys())) this.unregister(id);
    this.scheduler.dispose();
  }
}
