import { expectTypeOf } from 'expect-type';
import isomorphicFetch from 'isomorphic-fetch';
import nodeFetch from 'node-fetch';
import type { fetch as undiciFetch } from 'undici';
import { createTRPCProxyClient } from '../createTRPCClientProxy';
import { getFetch } from '../getFetch';
import { httpBatchLink } from '../links/httpBatchLink';
import { getAbortController } from './getAbortController';
import {
  AbortControllerEsque,
  AbortControllerInstanceEsque,
  FetchEsque,
  ResponseEsque,
} from './types';

describe('AbortController', () => {
  test('AbortControllerEsque', () => {
    expectTypeOf(
      getAbortController,
    ).returns.toEqualTypeOf<AbortControllerEsque | null>();

    expectTypeOf(() => {
      const AbortController = getAbortController(undefined)!;
      return new AbortController();
    }).returns.toEqualTypeOf<AbortControllerInstanceEsque>();
  });
});

describe('fetch', () => {
  test('parameters', () => {
    createTRPCProxyClient({
      links: [
        httpBatchLink({
          url: 'YOUR_SERVER_URL',
          fetch(url, options) {
            return fetch(url, options);
          },
        }),
      ],
    });
  });

  test('FetchEsque', () => {
    expectTypeOf(getFetch).returns.toEqualTypeOf<FetchEsque>();

    expectTypeOf(() =>
      getFetch()('', {
        body: '',
        headers: Math.random() > 0.5 ? [['a', 'b']] : { a: 'b' },
        method: 'GET',
        signal: new AbortSignal(),
      }),
    ).returns.toEqualTypeOf<Promise<ResponseEsque>>();

    getFetch({} as unknown as typeof fetch);
  });

  test('NativeFetchEsque', () => {
    getFetch(isomorphicFetch);
    getFetch(nodeFetch as any);

    // Passing in undiciFetch directly in Node v18.7.0 gives:
    // ReferenceError: TextEncoder is not defined
    // 🤷
    getFetch({} as unknown as typeof undiciFetch);
  });
});
