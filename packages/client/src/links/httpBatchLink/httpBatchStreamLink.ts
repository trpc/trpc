import { NonEmptyArray } from '../../internals/types';
import { HTTPResult } from '../internals/httpUtils';
import { Operation } from '../types';
import { RequesterFn, makeHttpBatchLink } from './genericMakeBatchLink';
import { streamingJsonHttpRequester } from './streamingHttpUtils';

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

const streamRequester: RequesterFn = (resolvedOpts, runtime, type, opts) => {
  return (batchOps, unitResolver) => {
    const path = batchOps.map((op) => op.path).join(',');
    const inputs = batchOps.map((op) => op.input);

    const httpRequesterOptions: Parameters<
      typeof streamingJsonHttpRequester
    >[0] = {
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

    const { promise, cancel } =
      streamingJsonHttpRequester(httpRequesterOptions);
    const batchPromise = promise.then((iterator) =>
      handleStreamedJsonResponse(iterator, batchOps, unitResolver),
    );
    return {
      promise: batchPromise,
      cancel,
    };
  };
};

export const unstable_httpBatchStreamLink = makeHttpBatchLink(streamRequester);
