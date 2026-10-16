/**
 * Cost of each way to make validation ctx-aware, per call:
 *
 *   node context-aware-input/bench.ts [iterations]
 *
 * "validate" rows call `~standard.validate` (or Effect's decoder) directly;
 * "call" rows go through the spike's whole Effect pipeline.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { Console, Context, Effect, Schema, SchemaGetter } from 'effect';
import { Command } from 'effect/cli';
import { z } from 'zod';
import { intArg, runScript } from '../kit.ts';
import { call, initTrpc, inputContext } from './core.ts';

interface User {
  isPro: boolean;
}
const user: User = { isPro: true };
const value = { limit: 500, cursor: 'abc', tags: ['a', 'b'] };

const makeZod = (max: number) =>
  z.object({
    limit: z.number().max(max),
    cursor: z.string().optional(),
    tags: z.array(z.string()).max(10),
  });
const makeEffect = (max: number) =>
  Schema.Struct({
    limit: Schema.Number.check(Schema.isLessThanOrEqualTo(max)),
    cursor: Schema.optional(Schema.String),
    tags: Schema.Array(Schema.String).check(Schema.isMaxLength(10)),
  });

const staticZod = makeZod(1000);
const staticEffect = makeEffect(1000);
const memo = new Map<boolean, ReturnType<typeof makeZod>>();
const memoZod = (u: User) => {
  let schema = memo.get(u.isPro);
  if (!schema) memo.set(u.isPro, (schema = makeZod(u.isPro ? 1000 : 100)));
  return schema;
};

const store = new AsyncLocalStorage<User>();
const alsZod = z.object({
  limit: z.number().refine((n) => n <= (store.getStore()!.isPro ? 1000 : 100)),
  cursor: z.string().optional(),
  tags: z.array(z.string()).max(10),
});

class CurrentUser extends Context.Service<CurrentUser, User>()('CurrentUser') {}
const serviceEffect = Schema.Struct({
  limit: Schema.Number.pipe(
    Schema.decode({
      decode: SchemaGetter.checkEffect((n: number) =>
        CurrentUser.use((u) => Effect.succeed(n <= (u.isPro ? 1000 : 100))),
      ),
      encode: SchemaGetter.passthrough(),
    }),
  ),
  cursor: Schema.optional(Schema.String),
  tags: Schema.Array(Schema.String).check(Schema.isMaxLength(10)),
});
const decodeStatic = Schema.decodeUnknownEffect(staticEffect);
const decodeService = Schema.decodeUnknownEffect(serviceEffect);
const userContext = Context.make(CurrentUser, user);

const validate = (schema: z.ZodType) => {
  const result = schema['~standard'].validate(value);
  if (result instanceof Promise || result.issues) throw new Error('invalid');
};

const t = initTrpc<{ ctx: { user: User } }>();
const procedures = {
  'call: static zod': t.procedure.input(staticZod).query(() => null),
  'call: callback zod (rebuilt)': t.procedure
    .input(({ ctx }) => makeZod(ctx.user.isPro ? 1000 : 100))
    .query(() => null),
  'call: ALS refine zod': t.procedure
    .input(
      z.object({
        limit: z
          .number()
          .refine(
            (n) =>
              n <= (inputContext<{ user: User }>().ctx.user.isPro ? 1000 : 100),
          ),
        cursor: z.string().optional(),
        tags: z.array(z.string()).max(10),
      }),
    )
    .query(() => null),
  'call: Effect services': t.procedure
    .provideService(CurrentUser, (ctx) => ctx.user)
    .input(serviceEffect)
    .query(() => null),
};

const syncCases: Record<string, () => void> = {
  'validate: static zod': () => validate(staticZod),
  'validate: callback zod (rebuilt)': () => validate(makeZod(1000)),
  'validate: callback zod (memoized by plan)': () => validate(memoZod(user)),
  'validate: ALS refine zod (run per call)': () =>
    store.run(user, () => validate(alsZod)),
  'validate: static Effect': () => {
    Effect.runSync(decodeStatic(value));
  },
  'validate: callback Effect (rebuilt)': () => {
    Effect.runSync(Schema.decodeUnknownEffect(makeEffect(1000))(value));
  },
  'validate: Effect services': () => {
    Effect.runSync(
      decodeService(value).pipe(Effect.provideContext(userContext)),
    );
  },
};

const report = (name: string, ms: number, n: number) =>
  Console.log(
    `${name.padEnd(44)} ${((ms * 1000) / n).toFixed(2).padStart(8)} µs/op ${Math.round(
      n / (ms / 1000),
    )
      .toLocaleString('en')
      .padStart(12)} ops/s`,
  );

/** Milliseconds `n` calls of a sync `fn` take, after a warm-up, timed in one loop. */
const timeSync = (fn: () => void, n: number) =>
  Effect.sync(() => {
    for (let i = 0; i < 2_000; i++) fn();
    const start = performance.now();
    for (let i = 0; i < n; i++) fn();
    return performance.now() - start;
  });

/** Milliseconds `n` runs of `run` take, after `warmup` runs. */
const time = <E, R>(
  run: Effect.Effect<unknown, E, R>,
  warmup: number,
  n: number,
) =>
  Effect.gen(function* () {
    for (let i = 0; i < warmup; i++) yield* run;
    const start = performance.now();
    for (let i = 0; i < n; i++) yield* run;
    return performance.now() - start;
  });

const bench = Command.make(
  'bench',
  { iterations: intArg('iterations', 50_000) },
  ({ iterations }) =>
    Effect.gen(function* () {
      for (const [name, fn] of Object.entries(syncCases)) {
        yield* report(name, yield* timeSync(fn, iterations), iterations);
      }
      const callIterations = Math.max(1, Math.floor(iterations / 5));
      for (const [name, procedure] of Object.entries(procedures)) {
        const run = Effect.promise(() =>
          call(procedure, { ctx: { user }, input: value }),
        );
        yield* report(
          name,
          yield* time(run, 500, callIterations),
          callIterations,
        );
      }
    }),
);

runScript(import.meta, bench);
