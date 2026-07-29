import type { ScreenSurface } from "../ScreenSurface";

export interface ScreenSurfaceRegistryEvents {
  registered: { screen: ScreenSurface };
  unregistered: { id: string };
  focuschange: { id: string | null };
}

export type ScreenSurfaceRegistryEventName = keyof ScreenSurfaceRegistryEvents;
