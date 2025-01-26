import type {
  CreateTRPCClientOptions,
  inferRouterClient,
  Resolver,
} from '@trpc/client';
import { getUntypedClient, TRPCUntypedClient } from '@trpc/client';
import type { ClientContext } from '@trpc/client/internals/types';
import type { inferProcedureOutput } from '@trpc/server';
import type {
  AnyClientTypes,
  AnyProcedure,
  AnyQueryProcedure,
  AnyRootTypes,
  AnyRouter,
  inferProcedureInput,
  inferTransformedProcedureOutput,
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
  TContext extends ClientContext,
> = {
  [TKey in keyof TRecord]: TRecord[TKey] extends infer $Value
    ? $Value extends AnyQueryProcedure
      ? Resolver<
          {
            input: inferProcedureInput<$Value>;
            output: inferTransformedProcedureOutput<TRoot, $Value>;
            errorShape: TRoot['errorShape'];
            transformer: TRoot['transformer'];
          },
          TContext
        >
      : $Value extends RouterRecord
        ? UseProcedureRecord<TRoot, $Value, TContext>
        : never
    : never;
};

export function createUseProxy<
  TRouter extends AnyRouter,
  TContext extends ClientContext,
>(client: TRPCUntypedClient<TRouter> | inferRouterClient<TRouter, TContext>) {
  const untypedClient: TRPCUntypedClient<TRouter> =
    client instanceof TRPCUntypedClient ? client : getUntypedClient(client);

  return createRecursiveProxy<
    UseProcedureRecord<
      TRouter['_def']['_config']['$types'],
      TRouter['_def']['record'],
      TContext
    >
  >((opts) => {
    const path = opts.path.join('.');

    return untypedClient.query(path, ...opts.args);
  });
}

type NextAppRouterUse<
  TRouter extends AnyRouter,
  TContext extends ClientContext,
> = {
  <TData extends Promise<unknown>[]>(
    cb: (
      t: UseProcedureRecord<
        TRouter['_def']['_config']['$types'],
        TRouter['_def']['record'],
        TContext
      >,
    ) => [...TData],
  ): {
    [TKey in keyof TData]: Awaited<TData[TKey]>;
  };
  <TData extends Promise<unknown>>(
    cb: (
      t: UseProcedureRecord<
        TRouter['_def']['_config']['$types'],
        TRouter['_def']['record'],
        TContext
      >,
    ) => TData,
  ): Awaited<TData>;
};
type CreateTRPCNextAppRouterBase<
  TRouter extends AnyRouter,
  TContext extends ClientContext,
> = {
  use: NextAppRouterUse<TRouter, TContext>;
};
export type CreateTRPCNextAppRouter<
  TRouter extends AnyRouter,
  TContext extends ClientContext,
> = ProtectedIntersection<
  CreateTRPCNextAppRouterBase<TRouter, TContext>,
  UseProcedureRecord<
    TRouter['_def']['_config']['$types'],
    TRouter['_def']['record'],
    TContext
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
  TRoot extends AnyClientTypes,
  TProc extends AnyProcedure,
> = {
  input: inferProcedureInput<TProc>;
  output: inferProcedureOutput<TProc>;
  errorShape: TRoot['errorShape'];
};
