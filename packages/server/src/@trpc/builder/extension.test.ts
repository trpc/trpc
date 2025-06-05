/////// core module definition /////////

import type { Builder, inferBuilderOptions } from './builder';
import { buildApi, type MiddlewareOptions, type Module } from './builder';
import { coreModule } from './core';

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

declare module './builder' {
  export interface BuilderModules<TOptions extends MiddlewareOptions> {
    [extension]: {
      pipeProps: ExtensionModuleOptions;
      builderProps: ExtensionModuleBuilder<TOptions>;
    };
  }
}
const extensionModule = (): Module<typeof extension> => ({
  name: extension,
  init() {
    throw new Error('Not implemented');
  },
});

//////// build api /////////

test('core module', () => {
  const api = buildApi([coreModule()]);

  const builder = api<{
    ctx: {
      foo: 'bar';
    };
  }>();

  const res = builder.coreFn();

  type $Options = inferBuilderOptions<typeof res>;
  expectTypeOf<$Options>().toMatchTypeOf<{
    _________ADDED_FROM_CORE_________: true;
  }>();

  // @ts-expect-error - extension not added
  builder.extFn();
});

test('extension module', () => {
  const api = buildApi([extensionModule()]);

  const builder = api<{
    //
  }>();

  builder.extFn();
});

test('core + extension', () => {
  const api = buildApi([coreModule(), extensionModule()]);

  const builder = api<{
    ctx: {
      foo: 'bar';
    };
  }>();

  builder.coreFn();
  builder.extFn();

  const res = builder.coreFn().extFn();

  type $Options = inferBuilderOptions<typeof res>;
  expectTypeOf<$Options>().toMatchTypeOf<{
    _________ADDED_FROM_CORE_________: true;
  }>();
});
