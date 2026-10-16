/**
 * Node.js `FileSystem` layer for programs that perform real filesystem I/O.
 *
 * The exported layer satisfies the platform-independent `FileSystem` service
 * with Node-backed operations for files, directories, metadata, permissions,
 * links, temporary paths, and path watching. Effects still call the service from
 * `effect/FileSystem`; this module only chooses the Node implementation.
 *
 * @since 4.0.0
 */
import * as NodeFileSystem from "@effect/platform-node-shared/NodeFileSystem"
import type { FileSystem } from "effect/FileSystem"
import type * as Layer from "effect/Layer"

/**
 * Provides the `FileSystem` service backed by Node filesystem APIs.
 *
 * @category layers
 * @since 4.0.0
 */
export const layer: Layer.Layer<FileSystem> = NodeFileSystem.layer
