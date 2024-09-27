/* eslint-disable @typescript-eslint/no-unused-vars */

import type { TypeError } from '@trpc/server/unstable-core-do-not-import/types';

export type Assign<T1, T2> = {
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

export const loadedModules = Symbol();

///////////// module base ////////////
export interface MiddlewareOptions {
  /**
   * The modules that are being used
   */
  [loadedModules]: BuilderModuleName;
  ctx: any;
  ctx_overrides: any;

  meta: any;
}

export interface BuilderModules<TOptions extends MiddlewareOptions> {}

export type BuilderModuleName = keyof BuilderModules<any>;

export type GetModuleDef<
  TOptions extends MiddlewareOptions,
  T extends BuilderModuleName,
> = BuilderModules<TOptions>[T];

const $typesSymbol = Symbol();
export type Builder<TOptions extends MiddlewareOptions> = UnionToIntersection<
  BuilderModules<TOptions>[TOptions[typeof loadedModules]]['builderProps']
> & {
  [$typesSymbol]: TOptions;
};
export type inferBuilderOptions<TBuilder> = TBuilder extends Builder<
  infer TOptions
>
  ? TOptions
  : never;

export type Module<TName extends BuilderModuleName> = {
  name: TName;
  init(): {
    /**
     * Properties that are injected into the arguments of the middlewares
     *
     */
    injectPipeProps: () => AnyBuilderModule[TName];
    /**
     * Builder properties
     * Eg.
     */
    builderProps: AnyBuilderModule[TName]['builderProps'];
  };
};

type CreateBuilder<TModules extends BuilderModuleName> = <
  TOptions extends Partial<Omit<MiddlewareOptions, typeof loadedModules>>,
>() => Builder<
  Assign<
    {
      ctx: object;
      meta: object;
      ctx_overrides: object;
    },
    TOptions
  > & {
    [loadedModules]: TModules;
  }
>;

export function buildApi<TModules extends [Module<any>, ...Module<any>[]]>(
  modules: TModules,
): CreateBuilder<TModules[number]['name']> {
  type $Name = TModules[number]['name'];
  type GetModuleDef<TOptions extends MiddlewareOptions = any> =
    BuilderModules<TOptions>;

  type AllOptions = GetModuleDef<$Name>;

  const initializedModules = modules.map((module) => module.init());

  const builderProps: Record<any, any> = {};
  for (const module of initializedModules) {
    Object.assign(builderProps, module.builderProps);
  }

  return function createBuilder() {
    throw new Error('Not implemented');
  };
}

export type AnyBuilderModule = BuilderModules<any>;

//////////////// no-op ////////////////

const placeholder = Symbol();

interface Placeholder<_TOptions extends MiddlewareOptions> {}

export interface BuilderModules<TOptions extends MiddlewareOptions> {
  [placeholder]: {
    pipeProps: Placeholder<TOptions>;
    builderProps: Placeholder<TOptions>;
  };
}
