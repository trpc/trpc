/* eslint-disable @typescript-eslint/no-unused-vars */
import type { Overwrite, ValueOf } from '../unstable-core-do-not-import/types';
import { mergeWithoutOverrides } from '../unstable-core-do-not-import/utils';

type Flatten<T> = { [K in keyof T]: T[K] };
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

export type Builder<
  TOptions extends MiddlewareOptions,
  TModules extends ModuleName,
> = GetModuleDef<TOptions, TModules>['builderProps'];

export type ModuleDefinition<TName extends ModuleName> = {
  name: TName;
  init(): {
    injectPipeProps: () => AnyMiddlewareModule[TName];
    builderProps: AnyMiddlewareModule[TName]['builderProps'];
  };
};

function buildApi<
  TModules extends [ModuleDefinition<any>, ...ModuleDefinition<any>[]],
>(modules: TModules) {
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

interface CoreModuleBuilderProps<TOptions extends MiddlewareOptions, TModules extends ModuleName> {
  coreFn: () => Builder<
    Overwrite<
      TOptions,
      {
        foo: 'bar';
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
    builderProps: CoreModuleBuilderProps<TOptions, TModules>;
  };
}

const coreModule = (): ModuleDefinition<typeof core> => ({
  name: core,
  init() {
    throw new Error('Not implemented');
  },
});
////////// extension definition //////////

interface ExtensionModuleOptions  {
  ext: true;
}

const extension = Symbol('extension');

interface ExtensionModuleBuilder<TOptions extends MiddlewareOptions, TModules extends ModuleName> {
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

const extensionModule = (): ModuleDefinition<typeof extension> => ({
  name: extension,
  init() {
    throw new Error('Not implemented');
  },
});
//////// build api /////////

{
  const api = buildApi([coreModule()]);

  const builder = api.createBuilder<{
    ctx: {
      foo: 'bar';
    };
  }>();

  const res = builder.coreFn();
}

{
  const api = buildApi([coreModule(), extensionModule()]);

  const builder = api.createBuilder<{
    ctx: {
      foo: 'bar';
    };
  }>();

  const res = builder.test();
  const res = builder.ext();
}
