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

export class TRPCBuilder<TParams extends Partial<InitGenerics> = {}> {
  context<TNewContext extends InitGenerics['ctx']>() {
    return new TRPCBuilder<Omit<TParams, 'ctx'> & { ctx: TNewContext }>();
  }
  meta<TNewMeta extends InitGenerics['meta']>() {
    return new TRPCBuilder<Omit<TParams, 'meta'> & { meta: TNewMeta }>();
  }

  create<TOptions extends $Helpers<TParams>['$Options']>(
    options?: ValidateShape<TOptions, $Helpers<TParams>['$Options']>,
  ) {
    type $HelperTypes = $Helpers<TParams>;
    type $Context = $HelperTypes['$Generics']['ctx'];
    type $Meta = $HelperTypes['$Generics']['meta'];
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
  }
}

type $Generics<TParams extends Partial<InitGenerics>> = CreateInitGenerics<{
  ctx: TParams['ctx'] extends undefined ? {} : NonNullable<TParams['ctx']>;
  meta: TParams['meta'] extends undefined ? {} : NonNullable<TParams['meta']>;
}>;

type $Helpers<TParams extends Partial<InitGenerics>> = {
  $Generics: $Generics<TParams>;

  $Context: $Generics<TParams>['ctx'];
  $Meta: PickFirstDefined<$Generics<TParams>['meta'], undefined>;
  $Options: Partial<InitOptions<$Generics<TParams>>>;
};

export const trpc = new TRPCBuilder();
