/**
 * Cost of each way to make validation ctx-aware, per call:
 *
 *   node context-aware-input/bench.ts [iterations]
 *
 * "validate" rows call `~standard.validate` (or Effect's decoder) directly;
 * "call" rows go through the spike's whole Effect pipeline.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { Context, Effect, Schema, SchemaGetter } from 'effect';
import { z } from 'zod';
import { call, initTrpc, inputContext } from './core.ts';

const iterations = Number(process.argv[2] ?? 50_000);

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

function report(name: string, ms: number, n: number) {
  const perOp = (ms * 1000) / n;
  console.log(
    `${name.padEnd(44)} ${perOp.toFixed(2).padStart(8)} µs/op ${Math.round(
      n / (ms / 1000),
    )
      .toLocaleString('en')
      .padStart(12)} ops/s`,
  );
}

for (const [name, fn] of Object.entries(syncCases)) {
  for (let i = 0; i < 2_000; i++) fn();
  const start = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  report(name, performance.now() - start, iterations);
}

const callIterations = Math.max(1, Math.floor(iterations / 5));
for (const [name, procedure] of Object.entries(procedures)) {
  const run = () => call(procedure, { ctx: { user }, input: value });
  for (let i = 0; i < 500; i++) await run();
  const start = performance.now();
  for (let i = 0; i < callIterations; i++) await run();
  report(name, performance.now() - start, callIterations);
}
