/**
 * @vitest-environment node
 */
import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { TRPCClientError } from '@trpc/client';
import type { TRPC_ERROR_CODE_KEY } from '@trpc/server';
import { initTRPC, TRPCError } from '@trpc/server';
import { makeResource } from '@trpc/server/unstable-core-do-not-import';
import fc from 'fast-check';

type Code = Extract<
  TRPC_ERROR_CODE_KEY,
  'BAD_REQUEST' | 'FORBIDDEN' | 'NOT_FOUND'
>;

type Failure =
  | { kind: 'error'; code: Code }
  | { kind: 'formatterThrows' }
  | { kind: 'unserializable' };

type Plan =
  | { id: number; kind: 'value'; value: string }
  | { id: number; kind: 'fail'; failure: Failure }
  | { id: number; kind: 'deferred'; failure: Failure | null }
  | { id: number; kind: 'stream'; values: string[]; failure: Failure | null };

type SubscriptionPlan = {
  id: number;
  values: string[];
  failure: Exclude<Failure, { kind: 'unserializable' }> | null;
};

interface Observed {
  values: unknown[];
  error: TRPC_ERROR_CODE_KEY | null;
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 1));

function uncaughtErrors() {
  const errors: unknown[] = [];
  const listener = (error: unknown) => errors.push(error);
  process.on('uncaughtException', listener);
  process.on('unhandledRejection', listener);
  return makeResource({ errors }, () => {
    process.off('uncaughtException', listener);
    process.off('unhandledRejection', listener);
  });
}

let open = 0;

/** Throws the failure, or returns a value that can't be serialized */
function settle(failure: Failure): bigint {
  switch (failure.kind) {
    case 'error':
      throw new TRPCError({ code: failure.code });
    case 'formatterThrows':
      throw new TRPCError({ code: 'CONFLICT', message: 'Taken' });
    case 'unserializable':
      return 1n;
  }
}

const t = initTRPC.create({
  errorFormatter(opts) {
    if (opts.error.code === 'CONFLICT') {
      throw new Error('Formatter failed');
    }
    return opts.shape;
  },
});

const router = t.router({
  planned: t.procedure
    .input((input) => input as Plan)
    .query(({ input }) => {
      switch (input.kind) {
        case 'value':
          return input.value;
        case 'fail':
          return settle(input.failure);
        case 'deferred': {
          const { failure } = input;
          return {
            later: tick().then(() => (failure ? settle(failure) : 'later')),
          };
        }
        case 'stream': {
          const { values, failure } = input;
          return (async function* () {
            open++;
            try {
              for (const value of values) {
                await tick();
                yield value;
              }
              if (failure) {
                yield settle(failure);
              }
            } finally {
              open--;
            }
          })();
        }
      }
    }),
  events: t.procedure
    .input((input) => input as SubscriptionPlan)
    .subscription(async function* ({ input }) {
      open++;
      try {
        for (const value of input.values) {
          await tick();
          yield value;
        }
        if (input.failure) {
          settle(input.failure);
        }
      } finally {
        open--;
      }
    }),
});

const code = fc.constantFrom<Code>('BAD_REQUEST', 'FORBIDDEN', 'NOT_FOUND');
const failure = fc.oneof(
  code.map((code): Failure => ({ kind: 'error', code })),
  fc.constant<Failure>({ kind: 'formatterThrows' }),
  fc.constant<Failure>({ kind: 'unserializable' }),
);
const values = fc.array(fc.string({ maxLength: 3 }), { maxLength: 3 });

const jsonPlan = fc.oneof(
  fc
    .string({ maxLength: 3 })
    .map((value) => ({ kind: 'value', value }) as const),
  failure.map((failure) => ({ kind: 'fail', failure }) as const),
);
const jsonlPlan = fc.oneof(
  jsonPlan,
  fc.option(failure).map((failure) => ({ kind: 'deferred', failure }) as const),
  fc
    .record({ values, failure: fc.option(failure) })
    .map((plan) => ({ kind: 'stream', ...plan }) as const),
);

function withIds<T>(plans: T[]): (T & { id: number })[] {
  return plans.map((plan, id) => ({ ...plan, id }));
}

function clientCode(failure: Failure): TRPC_ERROR_CODE_KEY {
  switch (failure.kind) {
    case 'error':
      return failure.code;
    case 'formatterThrows':
      return 'CONFLICT';
    case 'unserializable':
      return 'INTERNAL_SERVER_ERROR';
  }
}

function reportedCodes(failure: Failure | null): TRPC_ERROR_CODE_KEY[] {
  if (!failure) {
    return [];
  }
  switch (failure.kind) {
    case 'error':
      return [failure.code];
    case 'formatterThrows':
      return ['CONFLICT', 'INTERNAL_SERVER_ERROR'];
    case 'unserializable':
      return ['INTERNAL_SERVER_ERROR'];
  }
}

function failureOf(plan: Plan): Failure | null {
  return plan.kind === 'value' ? null : plan.failure;
}

function expected(plan: Plan): Observed {
  const fails = failureOf(plan);
  const values = run((): unknown[] => {
    switch (plan.kind) {
      case 'value':
        return [plan.value];
      case 'fail':
        return [];
      case 'deferred':
        return plan.failure ? [] : ['later'];
      case 'stream':
        return plan.values;
    }
  });
  return { values, error: fails ? clientCode(fails) : null };
}

function run<T>(fn: () => T): T {
  return fn();
}

async function observe(
  plan: Plan,
  call: (plan: Plan) => Promise<unknown>,
): Promise<Observed> {
  const values: unknown[] = [];
  try {
    const data: any = await call(plan);
    switch (plan.kind) {
      case 'value':
      case 'fail':
        values.push(data);
        break;
      case 'deferred':
        values.push(await data.later);
        break;
      case 'stream':
        for await (const value of data) {
          values.push(value);
        }
        break;
    }
    return { values, error: null };
  } catch (cause) {
    if (!(cause instanceof TRPCClientError)) {
      throw cause;
    }
    return { values, error: cause.data?.code ?? null };
  }
}

function setup(
  clientLink:
    | 'httpLink'
    | 'httpBatchLink'
    | 'httpBatchStreamLink'
    | 'httpSubscriptionLink',
) {
  const responseMetaCalls: unknown[] = [];
  const ctx = testServerAndClientResource(router, {
    clientLink,
    server: {
      responseMeta(opts) {
        responseMetaCalls.push(opts.info);
        return {};
      },
    },
  });
  return Object.assign(ctx, { responseMetaCalls });
}

type Context = ReturnType<typeof setup>;

/** The codes `onError` got, by the plan they came from; `-1` is the request */
function reports(ctx: Context) {
  const byPlan = new Map<number, TRPC_ERROR_CODE_KEY[]>();
  for (const [opts] of ctx.onErrorSpy.mock.calls) {
    const id = (opts.input as Plan | undefined)?.id ?? -1;
    byPlan.set(id, [...(byPlan.get(id) ?? []), opts.error.code]);
  }
  return byPlan;
}

async function checkServer(
  ctx: Context,
  opts: { requests: number; reports: Map<number, TRPC_ERROR_CODE_KEY[]> },
  uncaught: { errors: unknown[] },
) {
  await vi.waitFor(() => expect(open).toBe(0));
  expect(uncaught.errors).toEqual([]);
  expect(reports(ctx)).toEqual(opts.reports);
  expect(ctx.responseMetaCalls).toHaveLength(opts.requests);
  expect(new Set(ctx.responseMetaCalls).size).toBe(opts.requests);
}

function reset(ctx: Context) {
  open = 0;
  ctx.onErrorSpy.mockClear();
  ctx.responseMetaCalls.length = 0;
}

function expectedReports(plans: Plan[], requestFailures: number) {
  const byPlan = new Map<number, TRPC_ERROR_CODE_KEY[]>();
  for (const plan of plans) {
    const codes = reportedCodes(failureOf(plan));
    if (codes.length) {
      byPlan.set(plan.id, codes);
    }
  }
  if (requestFailures) {
    byPlan.set(-1, Array(requestFailures).fill('INTERNAL_SERVER_ERROR'));
  }
  return byPlan;
}

const isUnserializable = (plan: Plan) =>
  failureOf(plan)?.kind === 'unserializable';

describe.each(['httpLink', 'httpBatchLink'] as const)('%s', (clientLink) => {
  test('every call gets its own outcome and is reported once', async () => {
    await using ctx = setup(clientLink);
    using uncaught = uncaughtErrors();

    await fc.assert(
      fc.asyncProperty(
        fc.array(jsonPlan, { minLength: 1, maxLength: 4 }).map(withIds),
        async (plans) => {
          reset(ctx);
          const observed = await Promise.all(
            plans.map((plan) => observe(plan, ctx.client.planned.query)),
          );

          // a response that can't be serialized fails its whole request
          const requests =
            clientLink === 'httpLink' ? plans.map((p) => [p]) : [plans];
          const failedRequests = requests.filter((r) =>
            r.some(isUnserializable),
          );
          expect(observed).toEqual(
            plans.map((plan) =>
              failedRequests.some((r) => r.includes(plan))
                ? { values: [], error: 'INTERNAL_SERVER_ERROR' }
                : expected(plan),
            ),
          );
          await checkServer(
            ctx,
            {
              requests: requests.length,
              reports: expectedReports(
                plans.filter((plan) => !isUnserializable(plan)),
                failedRequests.length,
              ),
            },
            uncaught,
          );
        },
      ),
      { numRuns: 25, seed: 7894 },
    );
  });
});

test('httpBatchStreamLink: every call gets its own outcome and is reported once', async () => {
  await using ctx = setup('httpBatchStreamLink');
  using uncaught = uncaughtErrors();

  await fc.assert(
    fc.asyncProperty(
      fc.array(jsonlPlan, { minLength: 1, maxLength: 4 }).map(withIds),
      async (plans) => {
        reset(ctx);
        const observed = await Promise.all(
          plans.map((plan) => observe(plan, ctx.client.planned.query)),
        );

        expect(observed).toEqual(plans.map(expected));
        await checkServer(
          ctx,
          { requests: 1, reports: expectedReports(plans, 0) },
          uncaught,
        );
      },
    ),
    { numRuns: 25, seed: 7894 },
  );
});

test('httpSubscriptionLink: every subscription ends as planned and is reported once', async () => {
  await using ctx = setup('httpSubscriptionLink');
  using uncaught = uncaughtErrors();

  await fc.assert(
    fc.asyncProperty(
      fc.record({
        id: fc.constant(0),
        values,
        failure: fc.option(
          fc.oneof(
            code.map((code) => ({ kind: 'error', code }) as const),
            fc.constant({ kind: 'formatterThrows' } as const),
          ),
        ),
      }),
      async (plan) => {
        reset(ctx);
        const observed = await new Promise<Observed>((resolve) => {
          const values: unknown[] = [];
          const subscription = ctx.client.events.subscribe(plan, {
            onData: (value) => values.push(value),
            onError(error) {
              subscription.unsubscribe();
              resolve({ values, error: error.data?.code ?? null });
            },
            onComplete: () => resolve({ values, error: null }),
          });
        });

        expect(observed).toEqual({
          values: plan.values,
          error: plan.failure ? clientCode(plan.failure) : null,
        });
        const codes = reportedCodes(plan.failure);
        await checkServer(
          ctx,
          {
            requests: 1,
            reports: new Map(codes.length ? [[0, codes]] : []),
          },
          uncaught,
        );
      },
    ),
    { numRuns: 25, seed: 7894 },
  );
});
