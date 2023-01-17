/**
 * @see https://trpc.io/blog/tinyrpc-client
 */
import type {
  AnyMutationProcedure,
  AnyProcedure,
  AnyQueryProcedure,
  AnyRouter,
  ProcedureRouterRecord,
  inferProcedureInput,
  inferProcedureOutput,
} from '@trpc/server';
import type { TRPCResponse } from '@trpc/server/rpc';

interface ProxyCallbackOptions {
  path: string[];
  args: unknown[];
}

type ProxyCallback = (opts: ProxyCallbackOptions) => unknown;

function createRecursiveProxy(callback: ProxyCallback, path: string[]) {
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

type Resolver<TProcedure extends AnyProcedure> = (
  input: inferProcedureInput<TProcedure>,
) => Promise<inferProcedureOutput<TProcedure>>;
type DecorateProcedure<TProcedure extends AnyProcedure> =
  TProcedure extends AnyQueryProcedure
    ? {
        query: Resolver<TProcedure>;
      }
    : TProcedure extends AnyMutationProcedure
    ? {
        mutate: Resolver<TProcedure>;
      }
    : never;

/**
 * @internal
 */
type DecoratedProcedureRecord<TProcedures extends ProcedureRouterRecord> = {
  [TKey in keyof TProcedures]: TProcedures[TKey] extends AnyRouter
    ? DecoratedProcedureRecord<TProcedures[TKey]['_def']['record']>
    : TProcedures[TKey] extends AnyProcedure
    ? DecorateProcedure<TProcedures[TKey]>
    : never;
};

export const createTinyRPCClient = <TRouter extends AnyRouter>(
  baseUrl: string,
) =>
  createRecursiveProxy(async (opts) => {
    const path = [...opts.path]; // e.g. ["post", "byId", "query"]
    const method = path.pop()! as 'query' | 'mutate';
    const dotPath = path.join('.'); // "post.byId" - this is the path procedures have on the backend
    let uri = `${baseUrl}/${dotPath}`;

    const [input] = opts.args;
    const stringifiedInput = input !== undefined && JSON.stringify(input);
    let body: undefined | string = undefined;
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
  }, []) as DecoratedProcedureRecord<TRouter['_def']['record']>;
