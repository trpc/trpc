import type { DynamicModule, ExecutionContext } from '@nestjs/common'
import type { OpenAPIHandlerCodecCoreOptions } from '@orpc/openapi/standard'
import type { DefaultInitialContext } from '@orpc/server'
import type { StandardHandlerOptions } from '@orpc/server/standard'
import type { Promisable, Value } from '@orpc/shared'
import type { StandardLazyRequest } from '@standard-server/core'
import type { ToEventStreamOptions } from '@standard-server/node'
import { Module } from '@nestjs/common'
import { ImplementInterceptor } from './implement'

export const ORPC_MODULE_CONFIG_SYMBOL = Symbol.for('ORPC_NEST_MODULE_CONFIG')

/**
 * A standard lazy request extended with NestJS route parameters,
 * used as the request representation inside the `@orpc/nest` integration.
 *
 * @see {@link https://orpc.dev/docs/integrations/nest#toneststandardlazyrequest-option | Implement oRPC contract with NestJS - toNestStandardLazyRequest option}
 */
export interface NestStandardLazyRequest extends StandardLazyRequest {
  /**
   * Route parameters extracted from the request path.
   */
  params?: undefined | Record<string, string | string[]>
}

export type ORPCModuleConfig
  = & OpenAPIHandlerCodecCoreOptions<DefaultInitialContext>
    & StandardHandlerOptions<DefaultInitialContext>
    & (object extends DefaultInitialContext
      ? { context?: Value<Promisable<DefaultInitialContext>, [ctx: ExecutionContext]> }
      : { context: Value<Promisable<DefaultInitialContext>, [ctx: ExecutionContext]> })
    & {
      /**
       * Customize how to convert NestJS `req` and `res` to {@link NestStandardLazyRequest}.
       * You might need to define this if you are not using express or fastify adapters.
       */
      toNestStandardLazyRequest?: undefined | ((req: any, res: any) => NestStandardLazyRequest)

      /**
       * Options for how to convert the Standard Response to a Nest Response (returning value), like event stream options, etc.
       */
      toNestResponse?: undefined | {
        /**
         * Options for the event stream, like keep-alive settings, initial comment, etc.
         */
        eventStream?: undefined | ToEventStreamOptions
      }
    }

/**
 * NestJS module that configures the `@orpc/nest` integration via `forRoot`
 * or `forRootAsync`, providing options such as initial context, plugins,
 * and interceptors to `@Implement` handlers.
 *
 * @see {@link https://orpc.dev/docs/integrations/nest#configuration | Implement oRPC contract with NestJS - Configuration}
 */
@Module({})
export class ORPCModule {
  static forRoot(config: ORPCModuleConfig): DynamicModule {
    return {
      module: ORPCModule,
      providers: [
        {
          provide: ORPC_MODULE_CONFIG_SYMBOL,
          useValue: config,
        },
        ImplementInterceptor,
      ],
      exports: [ORPC_MODULE_CONFIG_SYMBOL, ImplementInterceptor],
      global: true,
    }
  }

  static forRootAsync(options: {
    imports?: any[]
    useFactory: (...args: any[]) => Promise<ORPCModuleConfig> | ORPCModuleConfig
    inject?: any[]
  }): DynamicModule {
    return {
      module: ORPCModule,
      imports: options.imports,
      providers: [
        {
          provide: ORPC_MODULE_CONFIG_SYMBOL,
          useFactory: options.useFactory,
          inject: options.inject,
        },
        ImplementInterceptor,
      ],
      exports: [ORPC_MODULE_CONFIG_SYMBOL, ImplementInterceptor],
      global: true,
    }
  }
}
