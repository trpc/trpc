/**
 * Node.js `Stdio` layer for the current process.
 *
 * The exported layer reuses the shared Node stdio implementation. It satisfies
 * the platform-independent `Stdio` service by reading command-line arguments
 * from `process.argv`, consuming input from `process.stdin`, and writing output
 * streams to `process.stdout` and `process.stderr`.
 *
 * @since 4.0.0
 */
import * as NodeStdio from "@effect/platform-node-shared/NodeStdio"
import type * as Layer from "effect/Layer"
import type { Stdio } from "effect/Stdio"

/**
 * Provides the `Stdio` service backed by the current process arguments,
 * stdin, stdout, and stderr streams.
 *
 * @category layers
 * @since 4.0.0
 */
export const layer: Layer.Layer<Stdio> = NodeStdio.layer
