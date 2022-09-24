import { mergeRoutersGeneric } from './internals/__generated__/mergeRoutersGeneric';
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
import { FlatOverwrite } from '../types';
import {
  CreateInitGenerics,
  CreateRootConfig,
  InitGenerics,
  InitOptions,
} from './internals/config';
import { createBuilder } from './internals/procedureBuilder';
import { PickFirstDefined, ValidateShape } from './internals/utils';
import { createMiddlewareFactory } from './middleware';
import { createRouterFactory } from './router';

type PartialInitGenerics = Partial<InitGenerics>;

type CreateInitGenericsFromPartial<TType extends PartialInitGenerics> =
  CreateInitGenerics<{
    ctx: TType['ctx'] extends InitGenerics['ctx'] ? TType['ctx'] : {};
    meta: TType['meta'] extends InitGenerics['meta'] ? TType['meta'] : {};
  }>;

/**
 * TODO: This can be improved:
 * - We should be able to chain `.meta()`/`.context()` only once
 * - Simplify typings
 * - Doesn't need to be a class but it doesn't really hurt either
 */

class TRPCBuilder<TParams extends Partial<InitGenerics> = {}> {
  context<TNewContext extends InitGenerics['ctx']>() {
    return new TRPCBuilder<FlatOverwrite<TParams, { ctx: TNewContext }>>();
  }
  meta<TNewMeta extends InitGenerics['meta']>() {
    return new TRPCBuilder<FlatOverwrite<TParams, { meta: TNewMeta }>>();
  }
  create<
    TOptions extends Partial<
      InitOptions<CreateInitGenericsFromPartial<TParams>>
    >,
  >(
    options?:
      | ValidateShape<
          TOptions,
          Partial<InitOptions<CreateInitGenericsFromPartial<TParams>>>
        >
      | undefined,
  ) {
    return createTRPCInner<TParams>()<TOptions>(options);
  }
}

/**
 * Initialize tRPC - be done exactly once per backend
 */
export const initTRPC = new TRPCBuilder();

function createTRPCInner<TParams extends Partial<InitGenerics>>() {
  type $Generics = CreateInitGenericsFromPartial<TParams>;

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
      ? TOptions['transformer'] extends DataTransformerOptions
        ? CombinedDataTransformer
        : DefaultDataTransformer
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
    ) as $Transformer;
    const _config: $Config = {
      transformer,
      errorShape: null as any,
      ctx: null as any,
      meta: null as any,
    };
    return {
      /**
       * These are just types, they can't be used
       * @internal
       */
      _config,
      /**
       * Builder object for creating procedures
       */
      procedure: createBuilder<$Config>(),
      /**
       * Create reusable middlewares
       */
      middleware: createMiddlewareFactory<$Config>(),
      /**
       * Create a router
       */
      router: createRouterFactory<$Config>({
        errorFormatter,
        transformer,
      }),
      /**
       * Merge Routers
       */
      mergeRouters: mergeRoutersGeneric,
    };
  };
}
