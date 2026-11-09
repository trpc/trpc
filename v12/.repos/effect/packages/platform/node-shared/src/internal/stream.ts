import type { Readable, Writable } from "node:stream"

// Keep teardown errors handled after removing the consumer's lifecycle listeners.
// Node emits the destruction error (if any) only once _destroy has completed.
// When `onDestroyed` is given, it is called once destruction has settled and
// the wait keeps the event loop alive.
export const destroyStream = (
  stream: Readable | Writable,
  cleanup: () => void,
  onDestroyed?: () => void
): void => {
  if (!("closed" in stream)) {
    cleanup()
    onDestroyed?.()
    return
  }
  const onDone = () => {
    clearImmediate(immediate)
    stream.off("error", onDone)
    stream.off("close", onDone)
    onDestroyed?.()
  }
  // With emitClose: false, successful destruction emits no event. Check the
  // public closed flag on a later turn, after any queued destruction error.
  // This also protects streams already closed but with an error still queued.
  const onClosed = () => {
    if (stream.closed) {
      onDone()
    } else {
      immediate = setImmediate(onClosed)
      if (!onDestroyed) immediate.unref()
    }
  }
  let immediate = setImmediate(onClosed)
  if (!onDestroyed) immediate.unref()
  stream.once("error", onDone)
  stream.once("close", onDone)
  cleanup()
  if (!stream.closed) {
    stream.destroy()
  }
}
