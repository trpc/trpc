/**
 * Process stdio for Bun applications.
 *
 * This module provides the Bun layer for Effect's `Stdio` service by using the
 * shared Node stdio implementation. Arguments come from `process.argv`, input
 * is read from `process.stdin`, and output and error output write to
 * `process.stdout` and `process.stderr`.
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
