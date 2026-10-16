import type { OrderablePlugin } from '@orpc/shared'
import type { Context } from '../../context'
import type { StandardHandlerOptions } from './handler'
import { sortPlugins } from '@orpc/shared'

export interface StandardHandlerPlugin<T extends Context> extends OrderablePlugin {
  /**
   * Initializes the plugin and returns new handler options.
   * Called once per plugin instance during composition.
   *
   * This method allows plugins to wrap, extend, or transform handler options
   * such as interceptors, or configuration.
   *
   * @param options - The current handler options from previous plugins or base configuration
   * @returns Transformed handler options with plugin's modifications applied
   *
   * @example
   * ```ts
   * init(options) {
   *   return {
   *     ...options,
   *     interceptors: [...(options.interceptors || []), myInterceptor]
   *   }
   * }
   * ```
   */
  init?(options: StandardHandlerOptions<T>): StandardHandlerOptions<T>
}

export class CompositeStandardHandlerPlugin<T extends Context> implements StandardHandlerPlugin<T> {
  readonly name = '~composite'

  protected readonly plugins: StandardHandlerPlugin<T>[]

  constructor(plugins: StandardHandlerPlugin<T>[] = []) {
    this.plugins = sortPlugins(plugins)
  }

  init(options: StandardHandlerOptions<T>): StandardHandlerOptions<T> {
    for (const plugin of this.plugins) {
      if (plugin.init) {
        options = plugin.init(options)
      }
    }

    return options
  }
}
