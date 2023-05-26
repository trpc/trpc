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

    const {cancel, promise} = streamingJsonHttpRequester(
      httpRequesterOptions,
      (index, res) => unitResolver(index, res),
    );

    const streamPromise = promise.then((res) => {
      // line-by-line parsing was abandoned, this should contain *all* procedure results
      if (res) return handleFullJsonResponse(res, batchOps)
      // line-by-line parsing was successful, procedure results have been individually sent to `unitResolver`
      else return []
    })

    return {
      promise: streamPromise,
      cancel,
    };
  };
};

export const unstable_httpBatchStreamLink = makeHttpBatchLink(streamRequester);
