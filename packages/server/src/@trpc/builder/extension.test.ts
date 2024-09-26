/////// core module definition /////////

import type { Builder, inferBuilderOptions } from './builder';
import { buildApi, type MiddlewareOptions, type Module } from './builder';
import { coreModule } from './core';

export interface CoreModuleOptions extends MiddlewareOptions {
  core: true;
}

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

{
  // core only
  const api = buildApi([coreModule()]);

  const builder = api.createBuilder<{
    ctx: {
      foo: 'bar';
    };
  }>();

  const _res = builder.coreFn();
  //     ^?

  // @ts-expect-error - extension not added
  builder.extFn();
}

{
  // core only
  const api = buildApi([coreModule()]);

  const builder = api.createBuilder<{
    ctx: {
      foo: 'bar';
    };
  }>();

  const _res = builder.coreFn();
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

  const _res1 = builder.extFn();

  //     ^?
  const res2 = builder.coreFn();

  type $Options = inferBuilderOptions<typeof res2>;
  expectTypeOf<$Options>().toMatchTypeOf<{
    _________ADDED_FROM_CORE_________: true;
  }>();

  //     ^?

  const _res3 = builder.coreFn().extFn().coreFn();
}

test('core module', () => {
  const api = buildApi([coreModule()]);

  const builder = api.createBuilder<{
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

  const builder = api.createBuilder<{
    //
  }>();

  builder.extFn();
});

test('core + extension', () => {
  const api = buildApi([coreModule(), extensionModule()]);

  const builder = api.createBuilder<{
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
