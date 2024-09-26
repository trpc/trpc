/* eslint-disable @typescript-eslint/no-unused-vars */

export type Merge<T1, T2> = {
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

export interface MiddlewareOptions {
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

export function buildApi<TModules extends [Module<any>, ...Module<any>[]]>(
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

//////////////// no-op ////////////////

const placeholder = Symbol();

interface Placeholder<_TOptions extends MiddlewareOptions> {}

export interface MiddlewareModules<TOptions extends MiddlewareOptions> {
  [placeholder]: {
    pipeProps: Placeholder<TOptions>;
    builderProps: Placeholder<TOptions>;
  };
}
