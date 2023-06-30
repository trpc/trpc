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
import { revalidateTag } from 'next/cache';

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

/**
 * @internal
 */
export function decomposeCacheTag(cacheTag: string) {
  const [procedurePath, input] = cacheTag.split('?input=') as [
    string,
    ...string[],
  ];
  return {
    procedurePath,
    input: input ? JSON.parse(input) : undefined,
  };
}

/**
 * @internal
 */
export function fuzzyRevalidation(cacheKey: string, seenTags: Set<string>) {
  const { input, procedurePath } = decomposeCacheTag(cacheKey);

  console.log('fuzzyRevalidation', cacheKey, seenTags);

  if (!procedurePath) {
    // no procedure path, revalidate all
    for (const key of seenTags) {
      console.log('revalidating', key);
      revalidateTag(key);
    }
    return;
  }

  if (input) {
    // if there is input, no need to fuzzy match, just revalidate the exact key
    console.log('revalidating', cacheKey);
    revalidateTag(cacheKey);
    return;
  }

  for (const key of seenTags) {
    if (key.startsWith(procedurePath)) {
      console.log('revalidating', key);
      revalidateTag(key);
    }
  }
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
