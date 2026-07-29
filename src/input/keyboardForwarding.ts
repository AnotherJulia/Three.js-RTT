/**
 * Forwards a keyboard event synthetically. Only used in `keyboardMode: "synthetic"` —
 * the default "focus-transfer" mode relies on a real element.focus() instead, so native
 * keyboard/IME/text-selection keeps working with zero synthesis. Synthetic dispatch is
 * best-effort for hotkeys only: IME composition is unreliable under dispatchEvent().
 */
export function forwardKeyboardEvent(target: EventTarget, nativeEvent: KeyboardEvent): void {
  const event = new KeyboardEvent(nativeEvent.type, {
    bubbles: true,
    cancelable: true,
    composed: true,
    key: nativeEvent.key,
    code: nativeEvent.code,
    ctrlKey: nativeEvent.ctrlKey,
    shiftKey: nativeEvent.shiftKey,
    altKey: nativeEvent.altKey,
    metaKey: nativeEvent.metaKey,
    repeat: nativeEvent.repeat,
  });
  target.dispatchEvent(event);
}
