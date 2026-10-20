import { Schema } from 'effect';
import {
  createTrpcClient,
  httpLink,
  routerType,
  type BuiltinErrorCode,
  type UndeclaredCode,
} from '@trpc12/trpc/client';
import { error, initTrpc } from '@trpc12/trpc/server';
import { describe, expectTypeOf, test } from 'vite-plus/test';
import { matchError, type ErrorOf } from './closed.ts';

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

type Now = ErrorOf<ReturnType<typeof client.byId.query>>;
type CodeOf<E> = E extends { readonly code: infer C } ? C : never;
type Undefined<E> = Extract<E, { readonly defined: false }>;
/** A query that doesn't stream can't be interrupted. */
type CallCode = Exclude<BuiltinErrorCode, 'STREAM_INTERRUPTED'>;

describe('the client union', () => {
  test('defined codes are the procedure ones, undefined ones are built-in', () => {
    expectTypeOf<CodeOf<Extract<Now, { defined: true }>>>().toEqualTypeOf<
      'NOT_FOUND' | 'BAD_REQUEST'
    >();
    expectTypeOf<CodeOf<Undefined<Now>>>().toEqualTypeOf<
      CallCode | UndeclaredCode
    >();
  });

  test('claiming a boundary code removes it', () => {
    type Claimed = Exclude<
      Now,
      { readonly code: 'NETWORK_ERROR' | 'CLIENT_CLOSED_REQUEST' }
    >;
    expectTypeOf<CodeOf<Undefined<Claimed>>>().toEqualTypeOf<
      | Exclude<CallCode, 'NETWORK_ERROR' | 'CLIENT_CLOSED_REQUEST'>
      | UndeclaredCode
    >();
  });

  test('a defined code keeps its data, a built-in one has none', () => {
    type NotFound = Extract<Now, { readonly code: 'NOT_FOUND'; defined: true }>;
    expectTypeOf<NotFound['data']>().toEqualTypeOf<{ id: string }>();
    expectTypeOf<
      Extract<Undefined<Now>, { readonly code: BuiltinErrorCode }>['data']
    >().toEqualTypeOf<undefined>();
  });
});

declare const now: Now;
declare const owned: Exclude<Now, { readonly defined: false }>;

describe('matchError', () => {
  test('every defined code, link code and unexpected are required', () => {
    const message = matchError(now, {
      NOT_FOUND: (err) => `no post ${err.data.id}`,
      BAD_REQUEST: (err) => err.message,
      NETWORK_ERROR: () => 'offline',
      BAD_RESPONSE: (err) => err.message,
      unexpected: (err) => {
        expectTypeOf(err.defined).toEqualTypeOf<false>();
        return err.code;
      },
    });
    expectTypeOf(message).toBeString();
    const links = {
      NETWORK_ERROR: () => 1,
      BAD_RESPONSE: () => 1,
    };
    // @ts-expect-error: BAD_REQUEST is missing
    matchError(now, { ...links, NOT_FOUND: () => 1, unexpected: () => 1 });
    // @ts-expect-error: unexpected is missing
    matchError(now, { ...links, NOT_FOUND: () => 1, BAD_REQUEST: () => 1 });
  });

  test('with the built-in errors owned above, only defined codes remain', () => {
    matchError(owned, { NOT_FOUND: () => 1, BAD_REQUEST: () => 1 });
    matchError(owned, {
      NOT_FOUND: () => 1,
      BAD_REQUEST: () => 1,
      // @ts-expect-error: nothing else is left to handle
      unexpected: () => 1,
    });
  });
});
