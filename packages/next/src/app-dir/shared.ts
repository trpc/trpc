import type {
  CreateTRPCClientOptions,
  Resolver,
  TRPCUntypedClient,
} from '@trpc/client';
import type {
  AnyClientTypes,
  AnyProcedure,
  AnyQueryProcedure,
  AnyRootTypes,
  AnyRouter,
  inferProcedureInput,
  inferRouterContext,
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
> = {
  [TKey in keyof TRecord]: TRecord[TKey] extends infer $Value
    ? $Value extends RouterRecord
      ? UseProcedureRecord<TRoot, $Value>
      : $Value extends AnyQueryProcedure
      ? Resolver<{
          input: inferProcedureInput<$Value>;
          output: inferTransformedProcedureOutput<TRoot, $Value>;
          errorShape: TRoot['errorShape'];
          transformer: TRoot['transformer'];
        }>
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
  createContext: () => Promise<inferRouterContext<TRouter>>;
}

/**
 * @internal
 * @link https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest#converting_a_digest_to_a_hex_string
 */
async function digestMessage(message: string) {
  const msgUint8 = new TextEncoder().encode(message); // encode as (utf-8) Uint8Array
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8); // hash the message
  const hashArray = Array.from(new Uint8Array(hashBuffer)); // convert buffer to byte array
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, '0'))
    .join(''); // convert bytes to hex string
  return hashHex;
}

/**
 * @internal
 */
export async function generateCacheTag(
  procedurePath: string,
  input: any,
  context: any,
) {
  return `${procedurePath}?hash=${await digestMessage(
    JSON.stringify({ input, context }),
  )}`;
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
  output: TProc['_def']['_output_out'];
  errorShape: TRoot['errorShape'];
};
