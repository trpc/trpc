/**
 * Aggregate Node.js platform services layer.
 *
 * This module defines the `NodeServices` union and a single `layer` that
 * provides Node-backed child process spawning, crypto, filesystem, path, stdio,
 * and terminal services. Use the layer when a Node program wants the standard
 * platform services from one place.
 *
 * @since 4.0.0
 */
import type { Crypto } from "effect/Crypto"
import type { FileSystem } from "effect/FileSystem"
import * as Layer from "effect/Layer"
import type { Path } from "effect/Path"
import type { ChildProcessSpawner } from "effect/process/ChildProcessSpawner"
import type { Stdio } from "effect/Stdio"
import type { Terminal } from "effect/Terminal"
import * as NodeChildProcessSpawner from "./NodeChildProcessSpawner.ts"
import * as NodeCrypto from "./NodeCrypto.ts"
import * as NodeFileSystem from "./NodeFileSystem.ts"
import * as NodePath from "./NodePath.ts"
import * as NodeStdio from "./NodeStdio.ts"
import * as NodeTerminal from "./NodeTerminal.ts"

/**
 * The union of core services provided by the Node platform layer, including
 * child process spawning, filesystem, path, stdio, and terminal services.
 *
 * @category models
 * @since 4.0.0
 */
export type NodeServices = ChildProcessSpawner | Crypto | FileSystem | Path | Stdio | Terminal

/**
 * Provides the default Node implementations for child process spawning,
 * filesystem, path, stdio, and terminal services.
 *
 * @category layers
 * @since 4.0.0
 */
export const layer: Layer.Layer<NodeServices> = Layer.provideMerge(
  NodeChildProcessSpawner.layer,
  Layer.mergeAll(
    NodeFileSystem.layer,
    NodeCrypto.layer,
    NodePath.layer,
    NodeStdio.layer,
    NodeTerminal.layer
  )
)
