/* eslint-disable @typescript-eslint/ban-types */
import {
  DefaultErrorShape,
  ErrorFormatter,
  ErrorFormatterShape,
  defaultFormatter,
} from '../error/formatter';
import {
  CombinedDataTransformer,
  DataTransformerOptions,
  DefaultDataTransformer,
  defaultTransformer,
  getDataTransformer,
} from '../transformer';
import {
  CreateInitGenerics,
  CreateRootConfig,
  InitGenerics,
  InitOptions,
} from './internals/config';
import { mergeRoutersFactory } from './internals/mergeRouters';
import { PickFirstDefined, ValidateShape } from './internals/utils';
import { createMiddlewareFactory } from './middleware';
import { createBuilder as createProcedure } from './procedure';
import { createRouterFactory } from './router';

export function initTRPC<TParams extends Partial<InitGenerics> = {}>() {
  type $Generics = CreateInitGenerics<{
    ctx: TParams['ctx'] extends undefined ? {} : NonNullable<TParams['ctx']>;
    meta: TParams['meta'] extends undefined ? {} : NonNullable<TParams['meta']>;
  }>;

  type $Context = $Generics['ctx'];
  type $Meta = $Generics['meta'];
  type $Options = Partial<InitOptions<$Generics>>;

  return function initTRPCInner<TOptions extends $Options>(
    options?: ValidateShape<TOptions, $Options>,
  ) {
    type $Formatter = PickFirstDefined<
      TOptions['errorFormatter'],
      ErrorFormatter<$Context, DefaultErrorShape>
    >;
    type $Transformer = TOptions['transformer'] extends DataTransformerOptions
      ? TOptions['transformer'] extends undefined
        ? DefaultDataTransformer
        : CombinedDataTransformer
      : DefaultDataTransformer;
    type $ErrorShape = ErrorFormatterShape<$Formatter>;

    type $Config = CreateRootConfig<{
      ctx: $Context;
      meta: $Meta;
      errorShape: $ErrorShape;
      transformer: $Transformer;
    }>;

    const errorFormatter = options?.errorFormatter ?? defaultFormatter;
    const transformer = getDataTransformer(
      options?.transformer ?? defaultTransformer,
    );
    return {
      /**
       * These are just types, they can't be used
       * @internal
       */
      _config: null as unknown as $Config,
      /**
       * Builder object for creating procedures
       */
      procedure: createProcedure<$Context, $Meta>(),
      /**
       * Create reusable middlewares
       */
      middleware: createMiddlewareFactory<$Context, $Meta>(),
      /**
       * Create a router
       * FIXME this should also use error formatter
       */
      router: createRouterFactory<$Config>({
        errorFormatter,
        transformer,
      }),
      /**
       * Merge Routers
       */
      mergeRouters: mergeRoutersFactory<$Config>(),
    };
  };
}
