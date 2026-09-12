import isomorphicFetch from 'isomorphic-fetch';
import nodeFetch from 'node-fetch';
import type { fetch as undiciFetch } from 'undici';
import { createTRPCClient } from '../createTRPCClient';
import { getFetch } from '../getFetch';
import { httpBatchLink } from '../links/httpBatchLink';
import type { FetchEsque, ResponseEsque } from './types';

describe('fetch', () => {
  test('parameters', () => {
    createTRPCClient({
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
