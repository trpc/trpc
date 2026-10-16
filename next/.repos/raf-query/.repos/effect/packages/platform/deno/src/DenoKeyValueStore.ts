/**
 * Deno-backed `KeyValueStore` layers using Web Storage APIs.
 *
 * @since 4.0.0
 */

import type * as Layer from "effect/Layer"
import * as KeyValueStore from "effect/persistence/KeyValueStore"

/**
 * Creates a `KeyValueStore` layer backed by `localStorage`, with values stored between sessions.
 *
 * @category layers
 * @since 4.0.0
 */
export const layerLocalStorage: Layer.Layer<KeyValueStore.KeyValueStore> = KeyValueStore.layerStorage(() =>
  localStorage
)

/**
 * Creates a `KeyValueStore` layer backed by `sessionStorage`, with values stored only for the current session.
 *
 * @category layers
 * @since 4.0.0
 */
export const layerSessionStorage: Layer.Layer<KeyValueStore.KeyValueStore> = KeyValueStore.layerStorage(() =>
  sessionStorage
)
