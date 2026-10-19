import { render } from '@testing-library/react';
import { initTRPC, TRPCError } from '@trpc/server';
import type {
  inferProcedureErrorShape,
  Maybe,
} from '@trpc/server/unstable-core-do-not-import';
import * as React from 'react';
import { describe, expect, expectTypeOf, test, vi } from 'vitest';
import {
  experimental_createActionHook,
  experimental_serverActionLink,
} from './create-action-hook';
import { experimental_createServerActionHandler } from './server';
import type { inferActionDef } from './shared';

class RateLimitError extends Error {
  constructor(public readonly retryAfterMs: number) {
    super('Too many requests');
  }
}

const t = initTRPC.create({
  // keeps the stack out of the snapshots
  isDev: false,
  errorFormatter: (opts) => ({
    ...opts.shape,
    data: { ...opts.shape.data, fromGlobalFormatter: true as const },
  }),
});

const rateLimited = t.procedure.errors((opts) => {
  if (opts.error.cause instanceof RateLimitError) {
    return {
      ...opts.shape,
      data: {
        ...opts.shape.data,
        kind: 'RATE_LIMIT' as const,
        retryAfterMs: opts.error.cause.retryAfterMs,
      },
    };
  }
  return undefined;
});

const limitedProcedure = rateLimited.mutation((): string => {
  throw new TRPCError({
    code: 'TOO_MANY_REQUESTS',
    cause: new RateLimitError(5_678),
  });
});

const plainProcedure = t.procedure.mutation((): string => {
  throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Fails' });
});

type Root = (typeof t)['_config']['$types'];

type LimitedShape = inferProcedureErrorShape<Root, typeof limitedProcedure>;
type PlainShape = inferProcedureErrorShape<Root, typeof plainProcedure>;

const createAction = experimental_createServerActionHandler(t, {
  createContext: () => ({}),
});

const useAction = experimental_createActionHook<typeof t>({
  links: [experimental_serverActionLink()],
});

describe('types', () => {
  test('`inferActionDef` carries the procedure error union', () => {
    type Def = inferActionDef<Root, typeof limitedProcedure>;

    expectTypeOf<Def['errorShape']>().toEqualTypeOf<LimitedShape>();
  });

  test('a procedure without `.errors()` keeps the router shape', () => {
    type Def = inferActionDef<Root, typeof plainProcedure>;

    expectTypeOf<Def['errorShape']>().toEqualTypeOf<PlainShape>();
    // @ts-expect-error - `kind` is only added by the procedure-level handler
    type _ = PlainShape['data']['kind'];
  });
});

describe('runtime', () => {
  test('a server action error carries the handler shape', async () => {
    const action = createAction(limitedProcedure);

    expect(await action()).toMatchInlineSnapshot(`
      Object {
        "error": Object {
          "code": -32029,
          "data": Object {
            "code": "TOO_MANY_REQUESTS",
            "httpStatus": 429,
            "kind": "RATE_LIMIT",
            "path": "",
            "retryAfterMs": 5678,
          },
          "message": "Too many requests",
        },
      }
    `);
  });

  test('a procedure without `.errors()` falls back to the global formatter', async () => {
    const action = createAction(plainProcedure);

    expect(await action()).toMatchInlineSnapshot(`
      Object {
        "error": Object {
          "code": -32603,
          "data": Object {
            "code": "INTERNAL_SERVER_ERROR",
            "fromGlobalFormatter": true,
            "httpStatus": 500,
            "path": "",
          },
          "message": "Fails",
        },
      }
    `);
  });

  test('the action hook surfaces the procedure error union', async () => {
    const action = createAction(limitedProcedure);

    function MyComponent() {
      const mutation = useAction(action);

      React.useEffect(() => {
        mutation.mutate();
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);

      if (mutation.status !== 'error') {
        return <>...</>;
      }

      expectTypeOf(mutation.error.data).toEqualTypeOf<
        Maybe<LimitedShape['data']>
      >();

      const data = mutation.error.data;
      if (data && 'kind' in data) {
        expectTypeOf(data.kind).toEqualTypeOf<'RATE_LIMIT'>();
        expectTypeOf(data.retryAfterMs).toEqualTypeOf<number>();
      }

      return <pre data-testid="err">{JSON.stringify(data)}</pre>;
    }

    const utils = render(<MyComponent />);

    // `@trpc/next` has no jest-dom matchers, so poll the node itself
    await vi.waitFor(() => {
      expect(utils.container.querySelector('[data-testid="err"]')).not.toBe(
        null,
      );
    });

    expect(
      JSON.parse(
        utils.container.querySelector('[data-testid="err"]')!.textContent,
      ),
    ).toMatchInlineSnapshot(`
      Object {
        "code": "TOO_MANY_REQUESTS",
        "httpStatus": 429,
        "kind": "RATE_LIMIT",
        "path": "",
        "retryAfterMs": 5678,
      }
    `);
  });
});
