export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`[Three.js-RTT] ${message}`);
}
