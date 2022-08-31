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

export class TRPC<
  TParams extends Partial<InitGenerics> = {},
  TOptions extends WithGenerics<TParams>['options'] = {},
> {
  constructor(
    public $options?: ValidateShape<TOptions, WithGenerics<TParams>['options']>,
  ) {}

  options<TNewOptions extends WithGenerics<TParams>['options']>(
    options: ValidateShape<TNewOptions, WithGenerics<TParams>['options']>,
  ) {
    return new TRPC(options);
  }

  context<TNewContext extends InitGenerics['ctx']>() {
    return new TRPC<Omit<TParams, 'ctx'> & { ctx: TNewContext }>();
  }

  meta<TNewMeta extends InitGenerics['meta']>() {
    return new TRPC<Omit<TParams, 'meta'> & { meta: TNewMeta }>();
  }

  /**
   * These are just types, they can't be used
   * @internal
   */
  _config: HelpersWithConfig<TParams, TOptions>['config'] = {} as any;
  /**
   * Builder object for creating procedures
   */
  procedure = createBuilder<typeof this._config>();
  /**
   * Create reusable middlewares
   */
  middleware = createMiddlewareFactory<typeof this._config>();

  private errorFormatter = this.$options?.errorFormatter ?? defaultFormatter;

  private transformer = getDataTransformer(
    this.$options?.transformer ?? defaultTransformer,
  ) as typeof this._config.transformer;
  /**
   * Create a router
   */
  router = createRouterFactory<typeof this._config>({
    errorFormatter: this.errorFormatter,
    transformer: this.transformer,
  });
  /**
   * Merge Routers
   */
  mergeRouters = mergeRoutersGeneric;
}

// internal helper types

type Generics<TParams extends Partial<InitGenerics>> = CreateInitGenerics<{
  ctx: TParams['ctx'] extends undefined ? {} : NonNullable<TParams['ctx']>;
  meta: TParams['meta'] extends undefined ? {} : NonNullable<TParams['meta']>;
}>;

interface WithGenerics<TParams extends Partial<InitGenerics>> {
  ctx: Generics<TParams>['ctx'];
  meta: PickFirstDefined<Generics<TParams>['meta'], undefined>;
  options: Partial<InitOptions<Generics<TParams>>>;
}

interface WithFormatters<
  TParams extends Partial<InitGenerics>,
  TOptions extends WithGenerics<TParams>['options'],
> extends WithGenerics<TParams> {
  formatter: PickFirstDefined<
    TOptions['errorFormatter'],
    ErrorFormatter<WithGenerics<TParams>['ctx'], DefaultErrorShape>
  >;

  transformer: TOptions['transformer'] extends DataTransformerOptions
    ? TOptions['transformer'] extends DataTransformerOptions
      ? CombinedDataTransformer
      : DefaultDataTransformer
    : DefaultDataTransformer;
}

interface HelpersWithConfig<
  TParams extends Partial<InitGenerics>,
  TOptions extends WithGenerics<TParams>['options'],
> extends WithFormatters<TParams, TOptions> {
  config: CreateRootConfig<{
    ctx: WithGenerics<TParams>['ctx'];
    meta: WithGenerics<TParams>['meta'];
    errorShape: ErrorFormatterShape<
      WithFormatters<TParams, TOptions>['formatter']
    >;
    transformer: WithFormatters<TParams, TOptions>['transformer'];
  }>;
}

export const trpc = new TRPC();
