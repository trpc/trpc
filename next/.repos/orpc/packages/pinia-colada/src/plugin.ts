import type { AnyNestedClient, InferClientContext, InferClientError } from '@orpc/client'
import type { OrderablePlugin } from '@orpc/shared'
import type { ProcedureUtilsOptions } from './procedure-utils'
import type { RouterUtilsOptions } from './router-utils'
import { sortPlugins } from '@orpc/shared'

export interface RouterUtilsPlugin<T extends AnyNestedClient> extends OrderablePlugin {
  /**
   * Initializes the router utils plugin and returns updated router utils options.
   * Called once per plugin instance during composition.
   *
   * This method allows plugins to wrap, extend, or transform router utils options,
   * such as interceptors or configuration.
   *
   * @param options - The current router utils options from previous plugins or base configuration
   * @returns Transformed router utils options with this plugin's modifications applied
   *
   * @example
   * ```ts
   * init(options) {
   *   return {
   *     ...options,
   *     mutationInterceptors: [...(options.mutationInterceptors ?? []), myInterceptor]
   *   }
   * }
   * ```
   */
  init?(options: RouterUtilsOptions<T>): RouterUtilsOptions<T>

  /**
   * Initializes per-procedure router utils options and returns updated options.
   * Called once per procedure utils instance during composition.
   *
   * This method allows plugins to customize merged procedure-specific defaults,
   * such as query or mutation options, for the current path.
   *
   * @param path - The current procedure path
   * @param options - The merged procedure utils options for the current procedure
   * @returns Transformed procedure utils options with this plugin's modifications applied
   */
  initProcedureOptions?(
    path: string[],
    options: ProcedureUtilsOptions<InferClientContext<T>, any, any, InferClientError<T>>,
  ): ProcedureUtilsOptions<InferClientContext<T>, any, any, InferClientError<T>>
}

export class CompositeRouterUtilsPlugin<T extends AnyNestedClient> implements RouterUtilsPlugin<T> {
  readonly name = '~composite'

  constructor(
    protected readonly plugins: RouterUtilsPlugin<T>[] = [],
  ) {
    this.plugins = sortPlugins(plugins)
  }

  init(options: RouterUtilsOptions<T>): RouterUtilsOptions<T> {
    for (const plugin of this.plugins) {
      if (plugin.init) {
        options = plugin.init(options)
      }
    }

    return options
  }

  initProcedureOptions(
    path: string[],
    options: ProcedureUtilsOptions<InferClientContext<T>, any, any, InferClientError<T>>,
  ): ProcedureUtilsOptions<InferClientContext<T>, any, any, InferClientError<T>> {
    for (const plugin of this.plugins) {
      if (plugin.initProcedureOptions) {
        options = plugin.initProcedureOptions(path, options)
      }
    }

    return options
  }
}
