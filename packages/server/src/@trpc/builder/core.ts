/////// core module definition /////////

import type { Builder } from './builder';
import { type Assign, type MiddlewareOptions, type Module } from './builder';

export interface CoreModuleOptions extends MiddlewareOptions {
  core: true;
}

const core = Symbol('core');

interface CoreModuleBuilder<TOptions extends MiddlewareOptions> {
  coreFn: () => Builder<
    Assign<
      TOptions,
      {
        _________ADDED_FROM_CORE_________: true;
      }
    >
  >;
}

declare module './builder' {
  export interface BuilderModules<TOptions extends MiddlewareOptions> {
    [core]: {
      pipeProps: CoreModuleOptions;
      builderProps: CoreModuleBuilder<TOptions>;
    };
  }
}

export const coreModule = (): Module<typeof core> => ({
  name: core,
  init() {
    throw new Error('Not implemented');
  },
});
