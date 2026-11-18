/** Only the newest sample can be drawn next frame. Release consumes its own coordinates synchronously. */
export function pointerFrame(apply: (event: PointerEvent) => void) {
  let frame: number | null = null;
  let latest: PointerEvent | null = null;
  const cancel = () => {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    latest = null;
  };
  return {
    move(event: PointerEvent) {
      latest = event;
      frame ??= requestAnimationFrame(() => {
        const event = latest;
        latest = null;
        frame = null;
        if (event) apply(event);
      });
    },
    release(event: PointerEvent) {
      cancel();
      apply(event);
    },
    cancel,
  };
}
