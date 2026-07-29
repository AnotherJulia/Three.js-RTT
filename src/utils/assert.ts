export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`[three-rtt] ${message}`);
}
