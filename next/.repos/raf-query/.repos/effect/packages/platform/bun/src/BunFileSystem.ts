/**
 * Bun layer for Effect's `FileSystem` service.
 *
 * This module exposes one `layer` that provides `FileSystem` in Bun by using
 * the shared Node file-system implementation. Once the layer is provided,
 * programs use the standard `effect/FileSystem` service operations.
 *
 * @since 4.0.0
 */
import * as NodeFileSystem from "@effect/platform-node-shared/NodeFileSystem"
import type { FileSystem } from "effect/FileSystem"
import type * as Layer from "effect/Layer"

/**
 * Layer that provides the `FileSystem` service for Bun using the shared Node file-system implementation.
 *
 * @category layers
 * @since 4.0.0
 */
export const layer: Layer.Layer<FileSystem, never, never> = NodeFileSystem.layer
