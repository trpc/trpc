import { Schema } from 'effect';
import {
  createTrpcClient,
  httpLink,
  routerType,
  type BuiltinErrorCode,
} from '@trpc12/trpc/client';
import { error, initTrpc } from '@trpc12/trpc/server';
import { describe, expectTypeOf, test } from 'vite-plus/test';
import { matchError, type Closed, type ErrorOf } from './closed.ts';

const t = initTrpc();
const router = {
  byId: t.procedure
    .input(Schema.Struct({ id: Schema.String }))
    .query((opts) =>
      opts.input.id === '0'
        ? error({ code: 'NOT_FOUND', data: { id: opts.input.id } })
        : { id: opts.input.id, title: 'Hello' },
    ),
};
const client = createTrpcClient({
  router: routerType<typeof router>(),
  links: [httpLink({ url: 'http://localhost/trpc' })],
});

type Today = ErrorOf<ReturnType<typeof client.byId.query>>;
type CodeOf<E> = E extends { readonly code: infer C } ? C : never;
type Undefined<E> = Extract<E, { readonly defined: false }>;
type IsOpen<C> = string extends C ? true : false;

describe('today', () => {
  test('defined codes are closed, the rest is any string', () => {
    expectTypeOf<CodeOf<Extract<Today, { defined: true }>>>().toEqualTypeOf<
      'NOT_FOUND' | 'BAD_REQUEST'
    >();
    expectTypeOf<IsOpen<CodeOf<Undefined<Today>>>>().toEqualTypeOf<true>();
  });

  test('claiming one boundary code subtracts nothing', () => {
    type Claimed = Exclude<Today, { readonly code: 'NETWORK_ERROR' }>;
    expectTypeOf<Undefined<Claimed>>().toEqualTypeOf<Undefined<Today>>();
  });

  test('claiming every undefined error already works', () => {
    type Owned = Exclude<Today, { readonly defined: false }>;
    expectTypeOf<CodeOf<Owned>>().toEqualTypeOf<'NOT_FOUND' | 'BAD_REQUEST'>();
  });
});

describe('closed', () => {
  type Now = Closed<Today>;

  test('undefined codes are the built-in ones', () => {
    expectTypeOf<CodeOf<Undefined<Now>>>().toEqualTypeOf<BuiltinErrorCode>();
  });

  test('claiming a boundary code removes it', () => {
    type Claimed = Exclude<
      Now,
      { readonly code: 'NETWORK_ERROR' | 'CLIENT_CLOSED_REQUEST' }
    >;
    expectTypeOf<CodeOf<Undefined<Claimed>>>().toEqualTypeOf<
      Exclude<BuiltinErrorCode, 'NETWORK_ERROR' | 'CLIENT_CLOSED_REQUEST'>
    >();
  });

  test('a defined code keeps its data', () => {
    type NotFound = Extract<Now, { readonly code: 'NOT_FOUND'; defined: true }>;
    expectTypeOf<NotFound['data']>().toEqualTypeOf<{ id: string }>();
  });
});

declare const now: Closed<Today>;
declare const owned: Exclude<Today, { readonly defined: false }>;
declare const today: Today;

describe('matchError', () => {
  test('every defined code and unexpected are required', () => {
    const message = matchError(now, {
      NOT_FOUND: (err) => `no post ${err.data.id}`,
      BAD_REQUEST: (err) => err.message,
      unexpected: (err) => {
        expectTypeOf(err.defined).toEqualTypeOf<false>();
        return err.code;
      },
    });
    expectTypeOf(message).toBeString();
    // @ts-expect-error: BAD_REQUEST is missing
    matchError(now, { NOT_FOUND: () => 1, unexpected: () => 1 });
    // @ts-expect-error: unexpected is missing
    matchError(now, { NOT_FOUND: () => 1, BAD_REQUEST: () => 1 });
  });

  test('with the undefined errors owned above, only defined codes remain', () => {
    matchError(owned, { NOT_FOUND: () => 1, BAD_REQUEST: () => 1 });
    matchError(owned, {
      NOT_FOUND: () => 1,
      BAD_REQUEST: () => 1,
      // @ts-expect-error: nothing unexpected is left to handle
      unexpected: () => 1,
    });
  });

  test('works on the open union too, since unexpected takes the rest', () => {
    matchError(today, {
      NOT_FOUND: () => 'missing',
      BAD_REQUEST: () => 'bad',
      unexpected: (err) => err.code,
    });
  });
});
