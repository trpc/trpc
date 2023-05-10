import { AnyRouter, ProcedureType } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import { TRPCClientError } from '../TRPCClientError';
import { dataLoader } from '../internals/dataLoader';
import { NonEmptyArray } from '../internals/types';
import {
  HTTPLinkBaseOptions,
  HTTPResult,
  getUrl,
  resolveHTTPLinkOptions,
  streamingJsonHttpRequested,
} from './internals/httpUtils';
import { transformResult } from './internals/transformResult';
import { HTTPHeaders, Operation, TRPCLink } from './types';

export interface HttpBatchLinkOptions extends HTTPLinkBaseOptions {
  maxURLLength?: number;
  /**
   * Headers to be set on outgoing requests or a callback that of said headers
   * @link http://trpc.io/docs/client/headers
   */
  headers?:
    | HTTPHeaders
    | ((opts: {
        opList: NonEmptyArray<Operation>;
      }) => HTTPHeaders | Promise<HTTPHeaders>);
}

/**
 * Is it an object with only numeric keys?
 */
function isObjectArray(value: object): value is Record<number, any> {
  return Object.keys(value).every((key) => !isNaN(key as any));
}

/**
 * Convert an object with numeric keys to an array
 */
function objectArrayToArray(value: Record<number, any>): any[] {
  const array: any[] = [];
  for (const key in value) {
    array[key] = value[key];
  }
  return array;
}

export function httpBatchLink<TRouter extends AnyRouter>(
  opts: HttpBatchLinkOptions,
): TRPCLink<TRouter> {
  const resolvedOpts = resolveHTTPLinkOptions(opts);
  // initialized config
  return (runtime) => {
    const maxURLLength = opts.maxURLLength || Infinity;

    const batchLoader = (type: ProcedureType) => {
      const validate = (batchOps: Operation[]) => {
        if (maxURLLength === Infinity) {
          // escape hatch for quick calcs
          return true;
        }
        const path = batchOps.map((op) => op.path).join(',');
        const inputs = batchOps.map((op) => op.input);

        const url = getUrl({
          ...resolvedOpts,
          runtime,
          type,
          path,
          inputs,
        });

        return url.length <= maxURLLength;
      };

      const fetch = (
        batchOps: Operation[],
        unitResolver: (index: number, value: NonNullable<HTTPResult>) => void
      ) => {
        const path = batchOps.map((op) => op.path).join(',');
        const inputs = batchOps.map((op) => op.input);

        const { promise, cancel } = streamingJsonHttpRequested({
          ...resolvedOpts,
          runtime,
          type,
          path,
          inputs,
          headers() {
            if (!opts.headers) {
              return {};
            }
            if (typeof opts.headers === 'function') {
              return opts.headers({
                opList: batchOps as NonEmptyArray<Operation>,
              });
            }
            return opts.headers;
          },
        });

        const batchPromise = promise.then(async (iterator) => {
          const firstItem = await iterator.next()
          if (!firstItem.done) {
            // first response is not last, this is indeed a streaming response
            unitResolver(firstItem.value[0] as unknown as number, firstItem.value[1])
            for await (const [index, data] of iterator) {
              unitResolver(index as unknown as number, data) // force casting to number because `a[0]` and `a["0"]` work the same
            }
            return []
          }
          // fallback to regular handling
          const res = firstItem.value!;
          const resJSON = Array.isArray(res.json)
            ? res.json
            : isObjectArray(res.json)
            ? objectArrayToArray(res.json)
            : batchOps.map(() => res.json);

          const result = resJSON.map((item) => ({
            meta: res.meta,
            json: item,
          }));

          return result;
        });

        return {
          promise: batchPromise,
          cancel,
        }
      };

      return { validate, fetch };
    };

    const query = dataLoader<Operation, HTTPResult>(batchLoader('query'));
    const mutation = dataLoader<Operation, HTTPResult>(batchLoader('mutation'));
    const subscription = dataLoader<Operation, HTTPResult>(
      batchLoader('subscription'),
    );

    const loaders = { query, subscription, mutation };
    return ({ op }) => {
      return observable((observer) => {
        const loader = loaders[op.type];
        const { promise, cancel } = loader.load(op);

        promise
          .then((res) => {
            const transformed = transformResult(res.json, runtime);

            if (!transformed.ok) {
              observer.error(
                TRPCClientError.from(transformed.error, {
                  meta: res.meta,
                }),
              );
              return;
            }
            observer.next({
              context: res.meta,
              result: transformed.result,
            });
            observer.complete();
          })
          .catch((err) => observer.error(TRPCClientError.from(err)));

        return () => {
          cancel();
        };
      });
    };
  };
}
