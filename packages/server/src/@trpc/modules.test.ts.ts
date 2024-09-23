/* eslint-disable @typescript-eslint/no-unused-vars */

import { expectTypeOf } from 'vitest';

type Merge<T1, T2> = {
  [$Key in keyof T1 | keyof T2]: $Key extends keyof T2
    ? T2[$Key]
    : $Key extends keyof T1
    ? T1[$Key]
    : never;
};

type UnionToIntersection<T> = (T extends any ? (k: T) => void : never) extends (
  k: infer I,
) => void
  ? I
  : never;

///////////// module base ////////////

interface MiddlewareOptions {
  /**
   * THe modules that are being used
   */
  $module: ModuleName;
  ctx: any;
  ctx_overrides: any;

  meta: any;
}

export interface MiddlewareModules<TOptions extends MiddlewareOptions> {}

export type ModuleName = keyof MiddlewareModules<any>;

export type MiddlewareModuleName = keyof MiddlewareModules<any>;

export type GetModuleDef<
  TOptions extends MiddlewareOptions,
  T extends ModuleName,
> = MiddlewareModules<TOptions>[T];

const $typesSymbol = Symbol();
export type Builder<TOptions extends MiddlewareOptions> = UnionToIntersection<
  MiddlewareModules<TOptions>[TOptions['$module']]['builderProps']
> & {
  [$typesSymbol]: TOptions;
};
export type inferBuilderOptions<TBuilder> = TBuilder extends Builder<
  infer TOptions
>
  ? TOptions
  : never;

export type Module<TName extends ModuleName> = {
  name: TName;
  init(): {
    /**
     * Properties that are injected into the arguments of the middlewares
     *
     */
    injectPipeProps: () => AnyMiddlewareModule[TName];
    /**
     * Builder properties
     * Eg.
     */
    builderProps: AnyMiddlewareModule[TName]['builderProps'];
  };
};

function buildApi<TModules extends [Module<any>, ...Module<any>[]]>(
  modules: TModules,
) {
  type $Name = TModules[number]['name'];
  type GetModuleDef<TOptions extends MiddlewareOptions = any> =
    MiddlewareModules<TOptions>;

  type AllOptions = GetModuleDef<$Name>;

  const initializedModules = modules.map((module) => module.init());

  const builderProps: Record<any, any> = {};
  for (const module of initializedModules) {
    Object.assign(builderProps, module.builderProps);
  }

  return {
    createBuilder: <
      TOptions extends Omit<Partial<MiddlewareOptions>, '$module'>,
    >(): Builder<
      Merge<
        {
          ctx: object;
          meta: object;
          ctx_overrides: object;
        },
        Merge<TOptions, { $module: $Name }>
      >
    > => {
      throw new Error('Not implemented');
    },
  };
}

export type AnyMiddlewareModule = MiddlewareModules<any>;
/////// core module definition /////////

export interface CoreModuleOptions extends MiddlewareOptions {
  core: true;
}

const core = Symbol('core');

interface CoreModuleBuilder<TOptions extends MiddlewareOptions> {
  coreFn: () => Builder<
    Merge<
      TOptions,
      {
        _________ADDED_FROM_CORE_________: true;
      }
    >
  >;
}
export interface MiddlewareModules<TOptions extends MiddlewareOptions> {
  [core]: {
    pipeProps: CoreModuleOptions;
    builderProps: CoreModuleBuilder<TOptions>;
  };
}

const coreModule = (): Module<typeof core> => ({
  name: core,
  init() {
    throw new Error('Not implemented');
  },
});
////////// extension definition //////////

interface ExtensionModuleOptions {
  ext: true;
}

const extension = Symbol('extension');

interface ExtensionModuleBuilder<TOptions extends MiddlewareOptions> {
  /**
   * WOOOOOT
   */
  extFn: () => Builder<TOptions>;
}

export interface MiddlewareModules<TOptions extends MiddlewareOptions> {
  [extension]: {
    pipeProps: ExtensionModuleOptions;
    builderProps: ExtensionModuleBuilder<TOptions>;
  };
}

const extensionModule = (): Module<typeof extension> => ({
  name: extension,
  init() {
    throw new Error('Not implemented');
  },
});
//////// build api /////////

{
  // coreo nly
  const api = buildApi([coreModule()]);

  const builder = api.createBuilder<{
    ctx: {
      foo: 'bar';
    };
  }>();

  const res = builder.coreFn();
  //     ^?

  // @ts-expect-error - extension not added
  builder.extFn();
}
{
  // extension only
  const api = buildApi([extensionModule()]);

  const builder = api.createBuilder<{
    //
  }>();

  builder.extFn();

  // @ts-expect-error - core not added
  builder.coreFn();
}

{
  // core + extension
  const api = buildApi([coreModule(), extensionModule()]);

  const builder = api.createBuilder<{
    ctx: {
      foo: 'bar';
    };
  }>();

  builder;
  // ^?

  const res1 = builder.extFn();

  //     ^?
  const res2 = builder.coreFn();

  type $Options = inferBuilderOptions<typeof res2>;
  expectTypeOf<$Options>().toMatchTypeOf<{
    _________ADDED_FROM_CORE_________: true;
  }>();

  //     ^?

  const res3 = builder.coreFn().extFn().coreFn();
}
