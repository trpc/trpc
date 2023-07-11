import {
  CreateTRPCClientOptions,
  Resolver,
  TRPCUntypedClient,
} from '@trpc/client';
import {
  AnyProcedure,
  AnyQueryProcedure,
  AnyRouter,
  Filter,
  inferHandlerInput,
  ProtectedIntersection,
  ThenArg,
} from '@trpc/server';
import { createRecursiveProxy } from '@trpc/server/shared';

/**
 * @internal
 */
export type UseProcedureRecord<TRouter extends AnyRouter> = {
  [TKey in keyof Filter<
    TRouter['_def']['record'],
    AnyQueryProcedure | AnyRouter
  >]: TRouter['_def']['record'][TKey] extends AnyRouter
    ? UseProcedureRecord<TRouter['_def']['record'][TKey]>
    : Resolver<TRouter['_def']['record'][TKey]>;
};

export function createUseProxy<TRouter extends AnyRouter>(
  client: TRPCUntypedClient<TRouter>,
) {
  return createRecursiveProxy((opts) => {
    const path = opts.path.join('.');

    return client.query(path, ...opts.args);
  }) as UseProcedureRecord<TRouter>;
}

type NextAppRouterUse<TRouter extends AnyRouter> = {
  <TData extends Promise<unknown>[]>(
    cb: (t: UseProcedureRecord<TRouter>) => [...TData],
  ): {
    [TKey in keyof TData]: ThenArg<TData[TKey]>;
  };
  <TData extends Promise<unknown>>(
    cb: (t: UseProcedureRecord<TRouter>) => TData,
  ): ThenArg<TData>;
};
type CreateTRPCNextAppRouterBase<TRouter extends AnyRouter> = {
  use: NextAppRouterUse<TRouter>;
};
export type CreateTRPCNextAppRouter<TRouter extends AnyRouter> =
  ProtectedIntersection<
    CreateTRPCNextAppRouterBase<TRouter>,
    UseProcedureRecord<TRouter>
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
export type inferActionDef<TProc extends AnyProcedure> = {
  input: inferHandlerInput<TProc>[0];
  output: TProc['_def']['_output_out'];
  errorShape: TProc['_def']['_config']['$types']['errorShape'];
};
