export { DomCompositor, type CompositorOptions } from "./compositor/DomCompositor";
export { DirtyTracker, findLiveElements, type LiveElementRect } from "./compositor/dirtyTracking";
export {
  ForeignObjectRasterStrategy,
  type ForeignObjectRasterStrategyOptions,
} from "./compositor/strategies/ForeignObjectRasterStrategy";
export { DEFAULT_STYLE_PROPERTIES } from "./compositor/strategies/style-allowlist";

export { ScreenTexture, type ScreenTextureOptions } from "./texture/ScreenTexture";

export { InputBridge, type InputBridgeOptions, type KeyboardMode } from "./input/InputBridge";
export { captureHitTestSnapshot, hitTestSnapshot, type HitCandidate } from "./input/hitTest";
export { forwardPointerEvent, findFocusableTarget, type ForwardablePointerType } from "./input/pointerForwarding";
export { forwardKeyboardEvent } from "./input/keyboardForwarding";

export { ScreenSurface, type ScreenSurfaceOptions, type ScreenSurfaceInputOptions } from "./ScreenSurface";
export { ScreenSurfaceRegistry } from "./registry/ScreenSurfaceRegistry";
export type { ScreenSurfaceRegistryEvents } from "./registry/events";

export { RafScheduler, type FrameCallback } from "./utils/raf-scheduler";
export { rectFromDomRect, relativeRect, rectContains, intersectRect, type Rect } from "./utils/rect";

export type { RasterFrame, RasterStrategy, DirtyMode, DetailLevel } from "./types";
