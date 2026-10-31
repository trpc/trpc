/**
 * Aggregate Bun platform services layer.
 *
 * This module defines the `BunServices` union and a single `layer` that
 * provides Bun-backed child process spawning, filesystem, path, stdio,
 * and terminal services. Use the layer when a Bun program wants the standard
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
import * as BunChildProcessSpawner from "./BunChildProcessSpawner.ts"
import * as BunFileSystem from "./BunFileSystem.ts"
import * as BunPath from "./BunPath.ts"
import * as BunStdio from "./BunStdio.ts"
import * as BunTerminal from "./BunTerminal.ts"

/**
 * The union of core services provided by the Bun platform layer, including child
 * process spawning, filesystem, path, stdio, and terminal services.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type BunServices = ChildProcessSpawner | FileSystem | Path | Terminal | Stdio

/**
 * Provides the default Bun implementations for child process spawning,
 * filesystem, path, stdio, and terminal services.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layer: Layer.Layer<BunServices> = BunChildProcessSpawner.layer.pipe(
  Layer.provideMerge(Layer.mergeAll(
    BunFileSystem.layer,
    BunPath.layer,
    BunStdio.layer,
    BunTerminal.layer
  ))
)
