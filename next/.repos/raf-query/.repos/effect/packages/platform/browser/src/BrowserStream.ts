/**
 * Browser DOM event streams.
 *
 * This module provides typed constructors that turn `window.addEventListener`
 * and `document.addEventListener` events into Effect `Stream` values. Both
 * helpers accept the usual listener options and an optional stream buffer size.
 *
 * @since 4.0.0
 */

import * as Stream from "effect/Stream"

/**
 * Creates a `Stream` from `window.addEventListener`.
 *
 * **Details**
 *
 * By default, the underlying buffer is unbounded in size. You can customize the
 * buffer size by passing an object as the second argument with the `bufferSize`
 * field.
 *
 * @category constructors
 * @since 4.0.0
 */
export const fromEventListenerWindow = <K extends keyof WindowEventMap>(
  type: K,
  options?: boolean | {
    readonly capture?: boolean
    readonly passive?: boolean
    readonly once?: boolean
    readonly bufferSize?: number | undefined
  } | undefined
): Stream.Stream<WindowEventMap[K], never, never> => Stream.fromEventListener<WindowEventMap[K]>(window, type, options)

/**
 * Creates a `Stream` from `document.addEventListener`.
 *
 * **Details**
 *
 * By default, the underlying buffer is unbounded in size. You can customize the
 * buffer size by passing an object as the second argument with the `bufferSize`
 * field.
 *
 * @category constructors
 * @since 4.0.0
 */
export const fromEventListenerDocument = <K extends keyof DocumentEventMap>(
  type: K,
  options?: boolean | {
    readonly capture?: boolean
    readonly passive?: boolean
    readonly once?: boolean
    readonly bufferSize?: number | undefined
  } | undefined
): Stream.Stream<DocumentEventMap[K], never, never> =>
  Stream.fromEventListener<DocumentEventMap[K]>(document, type, options)
