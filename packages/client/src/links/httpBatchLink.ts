import { HTTPResponseEnvelope } from '@trpc/server';
import { ProcedureType } from '@trpc/server';
import { HttpLinkOptions, TRPCLink } from './core';
import { httpRequest } from '../internals/httpRequest';
import { dataLoader } from '../internals/dataLoader';

export function httpBatchLink(opts: HttpLinkOptions): TRPCLink {
  const { url } = opts;
  // initialized config
  return (runtime) => {
    // initialized in app

    const fetcher =
      (type: ProcedureType) =>
      (keyInputPairs: { path: string; input: unknown }[]) => {
        const path = keyInputPairs.map(({ path }) => path).join(',');
        const input = keyInputPairs.map(({ input }) => input);

        const { promise, cancel } = httpRequest<
          HTTPResponseEnvelope<unknown, any>[]
        >({
          url,
          input,
          path,
          runtime,
          type,
          searchParams: 'batch=1',
        });

        return {
          promise: promise.then((res: unknown[] | unknown) => {
            if (!Array.isArray(res)) {
              return keyInputPairs.map(() => res);
            }
            return res;
          }),
          cancel,
        };
      };
    const query = dataLoader(fetcher('query'));
    const mutation = dataLoader(fetcher('mutation'));
    const subscription = dataLoader(fetcher('subscription'));

    const loaders = { query, subscription, mutation };
    return ({ op, prev, onDestroy }) => {
      const loader = loaders[op.type];
      const { promise, cancel } = loader.load(op);
      onDestroy(() => cancel());
      promise.then(prev).catch(prev);
    };
  };
}
