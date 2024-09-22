/* eslint-disable @typescript-eslint/no-unused-vars */
import type { Overwrite, ValueOf } from '../unstable-core-do-not-import/types';
import { mergeWithoutOverrides } from '../unstable-core-do-not-import/utils';

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

export type Builder<
  TOptions extends MiddlewareOptions,
  TModules extends ModuleName,
> = MiddlewareModules<TOptions, TModules>;

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
    createBuilder: <TOptions extends Partial<MiddlewareOptions>>() => {
      //
    },
  };
}

export type AnyMiddlewareModule = MiddlewareModules<any, any>;
/////// core module definition /////////

export interface CoreModuleOptions extends MiddlewareOptions {
  core: true;
}

const core = Symbol('core');
export interface MiddlewareModules<
  TOptions extends MiddlewareOptions,
  TModules extends ModuleName,
> {
  [core]: {
    pipeProps: CoreModuleOptions;
    builderProps: {
      test: () => Builder<
        Overwrite<
          TOptions,
          {
            foo: 'bar';
          }
        >,
        TModules
      >;
    };
  };
}

const coreModule = (): ModuleDefinition<typeof core> => ({
  name: core,
  init() {
    throw new Error('Not implemented');
  },
});
////////// extension definition //////////

interface ExtensionModuleOptions extends MiddlewareOptions {
  ext: true;
}

const extension = Symbol('extension');
export interface MiddlewareModules<
  TOptions extends MiddlewareOptions,
  TModules extends ModuleName,
> {
  [extension]: {
    pipeProps: {
      _ext: true;
    };
    builderProps: {
      ext: () => Builder<TOptions, TModules>;
    };
  };
}

const extensionModule = (): ModuleDefinition<typeof extension> => ({
  name: extension,
  init() {
    throw new Error('Not implemented');
  },
});
//////// build api /////////

const api = buildApi([coreModule()]);

api.createBuilder<{ foo: 'bar' }>().test();
