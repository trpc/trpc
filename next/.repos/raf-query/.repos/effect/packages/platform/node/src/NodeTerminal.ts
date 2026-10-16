/**
 * Node.js implementation of the Effect `Terminal` service.
 *
 * This module reuses the shared Node terminal implementation. `make` creates a
 * scoped process-backed `Terminal` service, and `layer` provides the default
 * service with the standard quit behavior for key input.
 *
 * @since 4.0.0
 */
import * as NodeTerminal from "@effect/platform-node-shared/NodeTerminal"
import type { Effect } from "effect/Effect"
import type { Layer } from "effect/Layer"
import type { Scope } from "effect/Scope"
import type { Terminal, UserInput } from "effect/Terminal"

/**
 * Creates a scoped `Terminal` service backed by process stdin/stdout, using the
 * optional predicate to decide when key input should end the input stream.
 *
 * @category constructors
 * @since 4.0.0
 */
export const make: (shouldQuit?: (input: UserInput) => boolean) => Effect<Terminal, never, Scope> = NodeTerminal.make

/**
 * Provides the default process-backed `Terminal` service, ending key input on
 * the default quit keys.
 *
 * @category layers
 * @since 4.0.0
 */
export const layer: Layer<Terminal> = NodeTerminal.layer
