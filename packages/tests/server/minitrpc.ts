import type {
  AnyMutationProcedure,
  AnyProcedure,
  AnyQueryProcedure,
  AnyRouter,
  ProcedureArgs,
  ProcedureRouterRecord,
} from '@trpc/server';
import type { TRPCResponse } from '@trpc/server/rpc';
import type { inferTransformedProcedureOutput } from '@trpc/server/shared';

interface ProxyCallbackOptions {
  path: string[];
  args: unknown[];
}

type ProxyCallback = (opts: ProxyCallbackOptions) => unknown;

const noop = () => {
  // noop
};

function createRecursiveProxy(callback: ProxyCallback, path: string[]) {
  const proxy: unknown = new Proxy(noop, {
    get(_obj, key) {
      if (typeof key !== 'string' || key === 'then') {
        // special case for if the proxy is accidentally treated
        // like a PromiseLike (like in `Promise.resolve(proxy)`)
        return undefined;
      }
      return createRecursiveProxy(callback, [...path, key]);
    },
    apply(_1, _2, args) {
      return callback({
        args,
        path,
      });
    },
  });

  return proxy;
}

type Resolver<TProcedure extends AnyProcedure> = (
  ...args: ProcedureArgs<TProcedure['_def']>
) => Promise<inferTransformedProcedureOutput<TProcedure>>;
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

export const createMiniTRPCClient = <TRouter extends AnyRouter>(url: string) =>
  createRecursiveProxy(async (opts) => {
    const parts = [...opts.path];
    const last = parts.pop()! as 'query' | 'mutate';
    const path = parts.join('.');

    let uri = `${url}/${path}`;
    const [input] = opts.args;
    if (last === 'query' && input !== undefined) {
      uri += `?input=${encodeURIComponent(JSON.stringify(input))}`;
    }
    const json: TRPCResponse = await fetch(uri, {
      method: last === 'query' ? 'GET' : 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body:
        last === 'mutate' && input !== undefined
          ? JSON.stringify(input)
          : undefined,
    }).then((res) => res.json());

    if ('error' in json) {
      throw new Error(`Error: ${json.error.message}`);
    }
    return json.result.data;
  }, []) as DecoratedProcedureRecord<TRouter['_def']['record']>;
