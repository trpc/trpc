import { expectTypeOf } from 'expect-type';
import isomorphicFetch from 'isomorphic-fetch';
import nodeFetch from 'node-fetch';
import { fetch as undiciFetch } from 'undici';
import { getFetch } from '../getFetch';
import { getAbortController } from './fetchHelpers';
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

    getAbortController(
      null as unknown as typeof import('abort-controller')['AbortController'],
    );

    expectTypeOf(() => {
      const AbortController = getAbortController(undefined)!;
      return new AbortController();
    }).returns.toEqualTypeOf<AbortControllerInstanceEsque>();
  });
});

describe('fetch', () => {
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
    getFetch(nodeFetch);
    getFetch(undiciFetch);
  });
});
