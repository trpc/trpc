/**
 * Configuration for Effect CLI command execution.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Context from "../Context.ts"
import * as Layer from "../Layer.ts"
import * as GlobalFlag from "./GlobalFlag.ts"

/**
 * Context reference for configuration shared by CLI parsing, help generation,
 * and command execution.
 *
 * **When to use**
 *
 * Use when you need to customize runner-wide CLI behavior, such as which
 * built-in global flags are available.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class CliConfig extends Context.Reference<CliConfig.Service>("effect/cli/CliConfig", {
  defaultValue: () => defaults
}) {}

/**
 * Types used by the `CliConfig` context reference.
 *
 * @stability unstable
 * @since 4.0.0
 */
export declare namespace CliConfig {
  /**
   * Configuration values used while running a CLI command.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export interface Service {
    /** Ordered built-in global flags, with earlier action flags taking precedence. */
    readonly builtIns: ReadonlyArray<GlobalFlag.BuiltIn>
  }
}

/**
 * Default CLI configuration containing every built-in global flag.
 *
 * @stability unstable
 * @category defaults
 * @since 4.0.0
 */
export const defaults: CliConfig.Service = {
  builtIns: GlobalFlag.BuiltIns
}

/**
 * Creates CLI configuration by merging the provided options over `defaults`.
 *
 * **When to use**
 *
 * Use when you need a configuration value to provide directly through the
 * `CliConfig` context reference.
 *
 * @see {@link layer} for providing configuration as a layer
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make = (options?: Partial<CliConfig.Service>): CliConfig.Service => ({
  ...defaults,
  ...options
})

/**
 * Creates a layer that provides CLI configuration merged over `defaults`.
 *
 * **When to use**
 *
 * Use when wiring customized CLI behavior into an application layer.
 *
 * @see {@link make} for creating a configuration value directly
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layer = (options?: Partial<CliConfig.Service>): Layer.Layer<never> =>
  Layer.succeed(CliConfig, make(options))
