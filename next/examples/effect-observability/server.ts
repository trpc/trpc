/**
 * The API: signups and the current user, with a database and a mailer as
 * Effect services. tRPC opens a `trpc.<path>` span per call once the
 * handler's layer has a tracer; the services' own spans nest under it.
 */
import { createServer } from 'node:http';
import { NodeHttpServer } from '@effect/platform-node';
import { Context, Effect, Layer, ManagedRuntime, Queue, Schema } from 'effect';
import { HttpServer } from 'effect/http';
import { serve } from '@trpc12/trpc/http';
import {
  createFetchHandler,
  type FetchHandlerOptions,
  initTrpc,
  TrpcError,
} from '@trpc12/trpc/server';
import { formatTrace, inMemoryTelemetry } from './telemetry.ts';

export const User = Schema.Struct({ id: Schema.String, email: Schema.String });
export type User = typeof User.Type;

export class EmailTaken extends TrpcError.Tagged('EMAIL_TAKEN', {
  status: 409,
  data: Schema.Struct({ email: Schema.String }),
}) {}

const dbSpan = (operation: string) => ({
  kind: 'client' as const,
  attributes: {
    'db.system.name': 'memory',
    'db.collection.name': 'users',
    'db.operation.name': operation,
  },
});

export class Db extends Context.Service<
  Db,
  {
    readonly insertUser: (email: string) => Effect.Effect<User, EmailTaken>;
    readonly findUser: (id: string) => Effect.Effect<User | undefined>;
  }
>()('Db') {
  static readonly memory: Layer.Layer<Db> = Layer.sync(Db, () => {
    const users = new Map<string, User>([
      ['u1', { id: 'u1', email: 'ada@example.com' }],
    ]);
    return {
      insertUser: (email) =>
        Effect.suspend(() => {
          if ([...users.values()].some((u) => u.email === email)) {
            return Effect.fail(new EmailTaken({ email }));
          }
          const user: User = { id: `u${users.size + 1}`, email };
          users.set(user.id, user);
          return Effect.succeed(user);
        }).pipe(Effect.withSpan('db.users.insert', dbSpan('insert'))),
      findUser: (id) =>
        Effect.sync(() => users.get(id)).pipe(
          Effect.withSpan('db.users.find', dbSpan('select')),
        ),
    };
  });
}

export class Mailer extends Context.Service<
  Mailer,
  { readonly welcome: (user: User) => Effect.Effect<void> }
>()('Mailer') {
  /**
   * Takes as long as a real mail API, then puts the address in `outbox`,
   * once the send's span has ended.
   */
  static readonly memory = (outbox: Queue.Queue<string>): Layer.Layer<Mailer> =>
    Layer.succeed(Mailer, {
      welcome: (user) =>
        Effect.sleep('50 millis').pipe(
          Effect.withSpan('mailer.welcome', {
            attributes: { 'enduser.id': user.id },
          }),
          Effect.andThen(Queue.offer(outbox, user.email)),
        ),
    });
}

export class CurrentUser extends Context.Service<CurrentUser, User>()(
  'CurrentUser',
) {}

const t = initTrpc<{ ctx: { userId: string | null } }>();

/**
 * Looks the caller up and provides them as a service. Its spans run inside
 * the call's span, and it tags that span with the user.
 */
const withUser = t.middleware.effect<{ provides: CurrentUser }>()((opts) =>
  Effect.gen(function* () {
    const db = yield* Db;
    const user = opts.ctx.userId
      ? yield* db.findUser(opts.ctx.userId)
      : undefined;
    if (!user) return yield* new TrpcError({ code: 'UNAUTHORIZED' });
    yield* Effect.annotateCurrentSpan('enduser.id', user.id);
    return yield* opts.next().pipe(Effect.provideService(CurrentUser, user));
  }),
);

export const appRouter = t.router({
  user: {
    signup: t.procedure
      .input(Schema.Struct({ email: Schema.String }))
      .mutation((opts) =>
        Effect.gen(function* () {
          const db = yield* Db;
          const mailer = yield* Mailer;
          const user = yield* db.insertUser(opts.input.email);
          // Answers without waiting for the mail; its span still joins the
          // call's trace.
          yield* Effect.forkDetach(mailer.welcome(user));
          return user;
        }),
      ),
    me: t.procedure.use(withUser).query(() => Effect.service(CurrentUser)),
  },
});
export type AppRouter = typeof appRouter;

/**
 * The handler's options. `layer` has the services and, to trace, the
 * tracer (an OpenTelemetry SDK layer).
 */
export const apiOptions = (
  layer: Layer.Layer<Db | Mailer>,
): FetchHandlerOptions<AppRouter> => ({
  router: appRouter,
  layer,
  createContext: (opts) => ({
    userId: opts.request.headers['authorization'] ?? null,
  }),
});

export const createApiHandler = (layer: Layer.Layer<Db | Mailer>) =>
  createFetchHandler(apiOptions(layer));

/**
 * Serves the API with an `api` SDK. `spans()` has every span once the
 * server is disposed, and `mailed()` waits for the next welcome mail.
 */
export async function listen(port = 0) {
  const api = inMemoryTelemetry('api');
  const outbox = Effect.runSync(Queue.unbounded<string>());
  const handler = createApiHandler(
    Layer.mergeAll(Db.memory, Mailer.memory(outbox), api.layer),
  );
  const runtime = ManagedRuntime.make(
    serve(handler).pipe(
      Layer.provideMerge(
        NodeHttpServer.layer(createServer, { port, host: '127.0.0.1' }),
      ),
      // Effect's HTTP server traces each request too, as `api`.
      Layer.provide(api.layer),
    ),
  );
  const origin = await runtime.runPromise(
    HttpServer.addressFormattedWith(Effect.succeed),
  );
  return {
    url: `${origin}/trpc`,
    spans: api.spans,
    mailed: () => Effect.runPromise(Queue.take(outbox)),
    [Symbol.asyncDispose]: async () => {
      await runtime.dispose();
      await handler.dispose();
    },
  };
}

if (import.meta.main) {
  const server = await listen(Number(process.env['PORT'] ?? 3000));
  console.log(`${server.url} (Ctrl-C prints the server's traces)`);
  process.once('SIGINT', async () => {
    await server[Symbol.asyncDispose]();
    const spans = server.spans();
    for (const traceId of new Set(spans.map((s) => s.spanContext().traceId))) {
      console.log(`\n${formatTrace(traceId, spans)}`);
    }
  });
}
