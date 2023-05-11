import { AnyRouter, ProcedureType } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import { TRPCClientError } from '../TRPCClientError';
import { dataLoader } from '../internals/dataLoader';
import { NonEmptyArray } from '../internals/types';
import {
  HTTPLinkBaseOptions,
  HTTPResult,
  getUrl,
  jsonHttpRequester,
  resolveHTTPLinkOptions,
  streamingJsonHttpRequester,
} from './internals/httpUtils';
import { transformResult } from './internals/transformResult';
import { HTTPHeaders, Operation, TRPCLink } from './types';

export interface HttpBatchLinkOptions extends HTTPLinkBaseOptions {
  maxURLLength?: number;
  streaming?: boolean;
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
function isObjectArray(value: HTTPResult['json']) {
  return Object.keys(value).every((key) => !isNaN(key as any));
}

/**
 * Convert an object with numeric keys to an array
 */
function objectArrayToArray(
  value: Record<number, HTTPResult['json']>,
): HTTPResult['json'][] {
  const array: HTTPResult['json'][] = [];
  for (const key in value) {
    array[key] = value[key] as HTTPResult['json'];
  }
  return array;
}

function handleFullJsonResponse(
  res: HTTPResult,
  batchOps: Operation[],
): HTTPResult[] {
  const resJSON: HTTPResult['json'][] = Array.isArray(res.json)
    ? res.json
    : isObjectArray(res.json)
    ? // we need to lie to TS here because we're transforming {"0": "foo", "1": "bar"} into ["foo", "bar"]
      objectArrayToArray(
        res.json as unknown as Record<number, HTTPResult['json']>,
      )
    : batchOps.map(() => res.json);

  const result = resJSON.map((item) => ({
    meta: res.meta,
    json: item,
  }));

  return result;
}

async function handleStreamedJsonResponse(
  iterator: AsyncGenerator<
    [index: string, data: HTTPResult],
    HTTPResult | undefined,
    unknown
  >,
  batchOps: Operation[],
  unitResolver: (index: number, value: NonNullable<HTTPResult>) => void,
): Promise<HTTPResult[]> {
  let item = await iterator.next();

  // first response is *the only* response, this is not a streaming response
  if (item.done) {
    return handleFullJsonResponse(item.value as HTTPResult, batchOps);
  }

  do {
    const index = item.value[0] as unknown as number; // force casting to number because `a[0]` and `a["0"]` work the same
    unitResolver(index, item.value[1]);
  } while (!(item = await iterator.next()).done);
  return [];
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
        unitResolver: (index: number, value: NonNullable<HTTPResult>) => void,
      ) => {
        const path = batchOps.map((op) => op.path).join(',');
        const inputs = batchOps.map((op) => op.input);

        const httpRequesterOptions: Parameters<typeof jsonHttpRequester>[0] &
          Parameters<typeof streamingJsonHttpRequester>[0] = {
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
        };

        if (opts.streaming === false) {
          const { promise, cancel } = jsonHttpRequester(httpRequesterOptions);
          const batchPromise = promise.then((res) =>
            handleFullJsonResponse(res, batchOps),
          );
          return {
            promise: batchPromise,
            cancel,
          };
        } else {
          const { promise, cancel } =
            streamingJsonHttpRequester(httpRequesterOptions);
          const batchPromise = promise.then((iterator) =>
            handleStreamedJsonResponse(iterator, batchOps, unitResolver),
          );
          return {
            promise: batchPromise,
            cancel,
          };
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

        return cancel;
      });
    };
  };
}
