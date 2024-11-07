/**
 * @see https://trpc.io/blog/tinyrpc-client
 */
import type {
  AnyTRPCMutationProcedure,
  AnyTRPCProcedure,
  AnyTRPCQueryProcedure,
  AnyTRPCRouter,
  inferProcedureInput,
  inferProcedureOutput,
  TRPCRouterRecord,
} from '@trpc/server';
import type { TRPCResponse } from '@trpc/server/rpc';

interface ProxyCallbackOptions {
  path: readonly string[];
  args: readonly unknown[];
}

type ProxyCallback = (opts: ProxyCallbackOptions) => unknown;

function createRecursiveProxy(
  callback: ProxyCallback,
  path: readonly string[],
) {
  const proxy: unknown = new Proxy(
    () => {
      // dummy no-op function since we don't have any
      // client-side target we want to remap to
    },
    {
      get(_obj, key) {
        if (typeof key !== 'string') return undefined;

        // Recursively compose the full path until a function is invoked
        return createRecursiveProxy(callback, [...path, key]);
      },
      apply(_1, _2, args) {
        // Call the callback function with the entire path we
        // recursively created and forward the arguments
        return callback({
          path,
          args,
        });
      },
    },
  );

  return proxy;
}

type Resolver<TProcedure extends AnyTRPCProcedure> = (
  input: inferProcedureInput<TProcedure>,
) => Promise<inferProcedureOutput<TProcedure>>;

type DecorateProcedure<TProcedure> = TProcedure extends AnyTRPCQueryProcedure
  ? {
      query: Resolver<TProcedure>;
    }
  : TProcedure extends AnyTRPCMutationProcedure
    ? {
        mutate: Resolver<TProcedure>;
      }
    : never;

type DecorateRouterRecord<TRecord extends TRPCRouterRecord> = {
  [TKey in keyof TRecord]: TRecord[TKey] extends infer $Value
    ? $Value extends TRPCRouterRecord
      ? DecorateRouterRecord<$Value>
      : $Value extends AnyTRPCProcedure
        ? DecorateProcedure<$Value>
        : never
    : never;
};

export const createTinyRPCClient = <TRouter extends AnyTRPCRouter>(
  baseUrl: string,
) =>
  createRecursiveProxy(async (opts) => {
    const path = [...opts.path]; // e.g. ["post", "byId", "query"]
    const method = path.pop()! as 'mutate' | 'query';
    const dotPath = path.join('.'); // "post.byId" - this is the path procedures have on the backend
    let uri = `${baseUrl}/${dotPath}`;

    const [input] = opts.args;
    const stringifiedInput = input !== undefined && JSON.stringify(input);
    let body: string | undefined = undefined;
    if (stringifiedInput !== false) {
      if (method === 'query') {
        uri += `?input=${encodeURIComponent(stringifiedInput)}`;
      } else {
        body = stringifiedInput;
      }
    }

    const json: TRPCResponse = await fetch(uri, {
      method: method === 'query' ? 'GET' : 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body,
    }).then((res) => res.json());

    if ('error' in json) {
      throw new Error(`Error: ${json.error.message}`);
    }
    // No error - all good. Return the data.
    return json.result.data;
  }, []) as DecorateRouterRecord<TRouter['_def']['record']>;
