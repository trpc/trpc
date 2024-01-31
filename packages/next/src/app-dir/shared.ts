import type {
  CreateTRPCClientOptions,
  Resolver,
  TRPCUntypedClient,
} from '@trpc/client';
import type {
  AnyProcedure,
  AnyQueryProcedure,
  AnyRootTypes,
  AnyRouter,
  inferProcedureInput,
  ProtectedIntersection,
  RouterRecord,
} from '@trpc/server/unstable-core-do-not-import';
import { createRecursiveProxy } from '@trpc/server/unstable-core-do-not-import';

/**
 * @internal
 */
export type UseProcedureRecord<
  TRoot extends AnyRootTypes,
  TRecord extends RouterRecord,
> = {
  [TKey in keyof TRecord]: TRecord[TKey] extends infer $Value
    ? $Value extends RouterRecord
      ? UseProcedureRecord<TRoot, $Value>
      : $Value extends AnyQueryProcedure
      ? Resolver<TRoot, $Value>
      : never
    : never;
};

export function createUseProxy<TRouter extends AnyRouter>(
  client: TRPCUntypedClient<TRouter>,
) {
  return createRecursiveProxy((opts) => {
    const path = opts.path.join('.');

    return client.query(path, ...opts.args);
  }) as UseProcedureRecord<
    TRouter['_def']['_config']['$types'],
    TRouter['_def']['record']
  >;
}

type NextAppRouterUse<TRouter extends AnyRouter> = {
  <TData extends Promise<unknown>[]>(
    cb: (
      t: UseProcedureRecord<
        TRouter['_def']['_config']['$types'],
        TRouter['_def']['record']
      >,
    ) => [...TData],
  ): {
    [TKey in keyof TData]: Awaited<TData[TKey]>;
  };
  <TData extends Promise<unknown>>(
    cb: (
      t: UseProcedureRecord<
        TRouter['_def']['_config']['$types'],
        TRouter['_def']['record']
      >,
    ) => TData,
  ): Awaited<TData>;
};
type CreateTRPCNextAppRouterBase<TRouter extends AnyRouter> = {
  use: NextAppRouterUse<TRouter>;
};
export type CreateTRPCNextAppRouter<TRouter extends AnyRouter> =
  ProtectedIntersection<
    CreateTRPCNextAppRouterBase<TRouter>,
    UseProcedureRecord<
      TRouter['_def']['_config']['$types'],
      TRouter['_def']['record']
    >
  >;

/**
 * @internal
 */
export interface CreateTRPCNextAppRouterOptions<TRouter extends AnyRouter> {
  config: () => CreateTRPCClientOptions<TRouter>;
}

/**
 * @internal
 */
export function generateCacheTag(procedurePath: string, input: any) {
  return input
    ? `${procedurePath}?input=${JSON.stringify(input)}`
    : procedurePath;
}

export function isFormData(value: unknown): value is FormData {
  if (typeof FormData === 'undefined') {
    // FormData is not supported
    return false;
  }
  return value instanceof FormData;
}

/**
 * @internal
 */
export interface ActionHandlerDef {
  input?: any;
  output?: any;
  errorShape: any;
}

// ts-prune-ignore-next
/**
 * @internal
 */
export type inferActionDef<
  TRoot extends AnyRootTypes,
  TProc extends AnyProcedure,
> = {
  input: inferProcedureInput<TProc>;
  output: TProc['_def']['_output_out'];
  errorShape: TRoot['errorShape'];
};
