import type { OrderablePlugin } from '@orpc/shared'
import type { ClientContext } from '../../types'
import type { StandardLinkOptions } from './link'
import { sortPlugins } from '@orpc/shared'

export interface StandardLinkPlugin<T extends ClientContext> extends OrderablePlugin {
  /**
   * Initializes the plugin and returns new link options.
   * Called once per plugin instance during composition.
   *
   * This method allows plugins to wrap, extend, or transform link options
   * such as interceptors, or configuration.
   *
   * @param options - The current link options from previous plugins or base configuration
   * @returns Transformed link options with plugin's modifications applied
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
  init?(options: StandardLinkOptions<T>): StandardLinkOptions<T>
}

export class CompositeStandardLinkPlugin<T extends ClientContext> implements StandardLinkPlugin<T> {
  name = '~composite'
  protected readonly plugins: StandardLinkPlugin<T>[]

  constructor(plugins: StandardLinkPlugin<T>[] = []) {
    this.plugins = sortPlugins(plugins)
  }

  init(options: StandardLinkOptions<T>): StandardLinkOptions<T> {
    for (const plugin of this.plugins) {
      if (plugin.init) {
        options = plugin.init(options)
      }
    }

    return options
  }
}
