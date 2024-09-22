/* eslint-disable @typescript-eslint/no-unused-vars */
import type { Overwrite, ValueOf } from '../unstable-core-do-not-import/types';
import { mergeWithoutOverrides } from '../unstable-core-do-not-import/utils';


type UnionToIntersection<T> = (
  T extends any ? (k: T) => void : never
) extends (k: infer I) => void
  ? I
  : never

///////////// module base ////////////

interface MiddlewareOptions {
  ctx: any;
  ctx_overrides: any;

  meta: any;
}

export interface MiddlewareModules<
  TOptions extends MiddlewareOptions,
  TModules extends ModuleName,
> {}

export type ModuleName = keyof MiddlewareModules<any, any>;

export type MiddlewareModuleName = keyof MiddlewareModules<any, any>;

export type GetModuleDef<
  TOptions extends MiddlewareOptions,
  T extends ModuleName,
> = MiddlewareModules<TOptions, T>[T];

type UnionToIntersection<U> = (U extends any ? (x: U) => void : never) extends (
  x: infer I,
) => void
  ? I
  : never;

export type Builder<
  TOptions extends MiddlewareOptions,
  TModules extends ModuleName,
> = UnionToIntersection<MiddlewareModules<TOptions, TModules>[TModules]['builderProps']>
  

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
  type GetModuleDef<
    TName extends $Name,
    TOptions extends MiddlewareOptions = any,
  > = MiddlewareModules<TOptions, TName>;

  type AllOptions = GetModuleDef<$Name>;

  const initializedModules = modules.map((module) => module.init());

  const builderProps: Record<any, any> = {};
  for (const module of initializedModules) {
    mergeWithoutOverrides(builderProps, module.builderProps);
  }

  return {
    createBuilder: <TOptions extends Partial<MiddlewareOptions>>(): Builder<
      Overwrite<
        {
          ctx: object;
          meta: object;
          ctx_overrides: object;
        },
        TOptions
      >,
      $Name
    > => {
      throw new Error('Not implemented');
    },
  };
}

export type AnyMiddlewareModule = MiddlewareModules<any, any>;
/////// core module definition /////////

export interface CoreModuleOptions extends MiddlewareOptions {
  core: true;
}

const core = Symbol('core');

interface CoreModuleBuilder<
  TOptions extends MiddlewareOptions,
  TModules extends ModuleName,
> {
  coreFn: () => Builder<
    Overwrite<
      TOptions,
      {
        _________ADDED_FROM_CORE_________: 'bar';
      }
    >,
    TModules
  >;
}
export interface MiddlewareModules<
  TOptions extends MiddlewareOptions,
  TModules extends ModuleName,
> {
  [core]: {
    pipeProps: CoreModuleOptions;
    builderProps: CoreModuleBuilder<TOptions, TModules>;
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

interface ExtensionModuleBuilder<
  TOptions extends MiddlewareOptions,
  TModules extends ModuleName,
> {
  extFn: () => Builder<TOptions, TModules>;
}

export interface MiddlewareModules<
  TOptions extends MiddlewareOptions,
  TModules extends ModuleName,
> {
  [extension]: {
    pipeProps: ExtensionModuleOptions;
    builderProps: ExtensionModuleBuilder<TOptions, TModules>;
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

  const res1 = builder.test();
  //     ^?
  const res2 = builder.ext();
  //     ^?
}
