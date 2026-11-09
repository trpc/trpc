/**
 * Aggregate Deno platform services layer.
 *
 * This module defines the `DenoServices` union and a single `layer` that
 * provides Deno-backed child process spawning, filesystem, path, stdio,
 * and terminal services. Use the layer when a Deno program wants the standard
 * platform services from one place.
 *
 * @stability unstable
 * @since 4.0.0
 */
import type { FileSystem } from "effect/FileSystem"
import * as Layer from "effect/Layer"
import type { Path } from "effect/Path"
import type { ChildProcessSpawner } from "effect/process/ChildProcessSpawner"
import type { Stdio } from "effect/Stdio"
import type { Terminal } from "effect/Terminal"
import * as DenoChildProcessSpawner from "./DenoChildProcessSpawner.ts"
import * as DenoFileSystem from "./DenoFileSystem.ts"
import * as DenoPath from "./DenoPath.ts"
import * as DenoStdio from "./DenoStdio.ts"
import * as DenoTerminal from "./DenoTerminal.ts"

/**
 * The union of core services provided by the Deno platform layer, including
 * child process spawning, filesystem, path, stdio, and terminal services.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type DenoServices = ChildProcessSpawner | FileSystem | Path | Terminal | Stdio

/**
 * Provides the default Deno implementations for child process spawning,
 * crypto, filesystem, path, stdio, and terminal services.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layer: Layer.Layer<DenoServices> = DenoChildProcessSpawner.layer.pipe(
  Layer.provideMerge(Layer.mergeAll(
    DenoFileSystem.layer,
    DenoPath.layer,
    DenoStdio.layer,
    DenoTerminal.layer
  ))
)
