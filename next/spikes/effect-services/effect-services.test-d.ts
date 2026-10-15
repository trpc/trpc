import * as Context from 'effect/Context';
import * as Data from 'effect/Data';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { describe, expectTypeOf, test } from 'vite-plus/test';
import { createHandler, initTrpc, type inferRouterServices } from './core.ts';

interface Post {
  id: string;
}
class PostRepo extends Context.Service<
  PostRepo,
  { find: (id: string) => Effect.Effect<Post> }
>()('PostRepo') {}
class Mailer extends Context.Service<
  Mailer,
  { send: (to: string) => Effect.Effect<void> }
>()('Mailer') {}
class Clock extends Context.Service<Clock, { now: Effect.Effect<Date> }>()(
  'Clock',
) {}
class CurrentUser extends Context.Service<CurrentUser, { id: string }>()(
  'CurrentUser',
) {}
class Unauthorized extends Data.TaggedError('Unauthorized') {}

declare const verify: (
  token: string | undefined,
) => Effect.Effect<{ id: string }, Unauthorized, Clock>;

const postRepo = Layer.succeed(PostRepo, {
  find: (id) => Effect.succeed({ id }),
});
const mailer = Layer.succeed(Mailer, { send: () => Effect.void });
const clock = Layer.succeed(Clock, { now: Effect.sync(() => new Date()) });

describe('06 (g) M-A: middleware that provides a service', () => {
  const t = initTrpc.create<{ ctx: { token?: string } }>();

  const auth = t.middleware.effect<{ provides: CurrentUser }>()(
    ({ ctx, next }) =>
      Effect.gen(function* () {
        const user = yield* verify(ctx.token);
        return yield* next().pipe(Effect.provideService(CurrentUser, user));
      }),
  );

  test('provided services are removed from the procedure R; middleware R is added', () => {
    const me = t.procedure.use(auth).query(() =>
      Effect.gen(function* () {
        const user = yield* CurrentUser;
        const repo = yield* PostRepo;
        return yield* repo.find(user.id);
      }),
    );
    expectTypeOf(me['~types'].services).toEqualTypeOf<PostRepo | Clock>();
    expectTypeOf(me['~types'].errors).toEqualTypeOf<Unauthorized>();
  });

  test('without the middleware the service stays required', () => {
    const me = t.procedure.query(() => CurrentUser.useSync((u) => u));
    expectTypeOf(me['~types'].services).toEqualTypeOf<CurrentUser>();
  });

  test('forgetting to provide a declared service is an error in the middleware body', () => {
    t.middleware.effect<{ provides: CurrentUser }>()(
      // @ts-expect-error the returned Effect still requires CurrentUser
      ({ next }) => next(),
    );
  });
});

describe('02 (b) S1: inferred services', () => {
  const t = initTrpc.create<{ ctx: {} }>();
  const router = {
    post: {
      byId: t.procedure.query(() => PostRepo.use((r) => r.find('1'))),
      notify: t.procedure.query(() => Mailer.use((m) => m.send('a'))),
    },
    health: t.procedure.query(() => Effect.succeed('ok')),
  };

  test('the router carries the union of services', () => {
    expectTypeOf<inferRouterServices<typeof router>>().toEqualTypeOf<
      PostRepo | Mailer
    >();
  });

  test('the handler layer must cover the union', () => {
    createHandler({ root: t, router, layer: Layer.mergeAll(postRepo, mailer) });
    // @ts-expect-error Mailer is not provided
    createHandler({ root: t, router, layer: postRepo });
    // extra services are fine
    createHandler({
      root: t,
      router,
      layer: Layer.mergeAll(postRepo, mailer, clock),
    });
  });
});

describe('02 (b) S2: declared services', () => {
  const t = initTrpc.create<{ ctx: {}; services: PostRepo | Mailer }>();

  test('resolvers may use declared services', () => {
    t.procedure.query(() => PostRepo.use((r) => r.find('1')));
  });

  test('an undeclared service is an error on the resolver', () => {
    // @ts-expect-error Clock is not declared
    t.procedure.query(() => Clock.use((c) => c.now));
  });

  test('the handler layer must cover the declared services, not the union', () => {
    const router = {
      byId: t.procedure.query(() => PostRepo.use((r) => r.find('1'))),
    };
    // Mailer is declared, so it is required even though no procedure uses it.
    // @ts-expect-error Mailer is not provided
    createHandler({ root: t, router, layer: postRepo });
    createHandler({ root: t, router, layer: Layer.mergeAll(postRepo, mailer) });
  });
});
