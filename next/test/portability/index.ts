/**
 * TS2742 portability fixture: everything exported here must be nameable in
 * emitted `.d.ts` files under pnpm isolation. `pnpm typecheck` emits
 * declarations into `dist/`, which fails on an unnameable type.
 *
 * @see ../../.agent-docs/proposals/01-packages-and-type-portability.md
 */
import { Context, Effect, Layer, Schema, Stream } from 'effect';
import {
  createTrpcClient,
  dedupeLink,
  httpLink,
  link,
  localLink,
  routerType,
  splitLink,
  wsLink,
} from 'trpcdev/client';
import { contract, toContract, type inferContract } from 'trpcdev/contract';
import { createEffectClient } from 'trpcdev/effect';
import {
  createOpenApiHandler,
  generateOpenApi,
  openApiLink,
  openApiReference,
} from 'trpcdev/openapi';
import {
  createFetchHandler,
  createRouterClient,
  error,
  initTrpc,
  mergeRouters,
  middleware,
  ok,
  tracked,
} from 'trpcdev/server';
import { onFinish } from 'trpcdev/middleware';
import { createSerializer } from 'trpcdev/serializer';
import { z } from 'zod';

export interface User {
  id: string;
  name: string;
}

class PostRepo extends Context.Service<
  PostRepo,
  { find: (id: string) => Effect.Effect<{ id: string; title: string } | null> }
>()('PostRepo') {}

export const PostRepoLive = Layer.succeed(PostRepo, {
  find: (id) => Effect.succeed(id === '1' ? { id, title: 'Hello' } : null),
});

export const t = initTrpc<{
  ctx: { user: User | null };
  meta: { scope?: string };
}>();

export const publicProcedure = t.procedure;

export const authed = t.procedure.use(({ ctx, next }) =>
  ctx.user
    ? next({ ctx: { user: ctx.user } })
    : error({ code: 'UNAUTHORIZED' }),
);

export const timed = t.middleware(async ({ next }) => next());

export const requireAdmin = middleware<{ ctx: { user: User } }>()(
  ({ ctx, next }) =>
    ctx.user.id === 'admin' ? next() : error({ code: 'FORBIDDEN' }),
);

class CurrentUser extends Context.Service<CurrentUser, User>()('CurrentUser') {}

export const withCurrentUser = t.middleware.effect<{ provides: CurrentUser }>()(
  ({ ctx, next }) =>
    ctx.user
      ? next().pipe(Effect.provideService(CurrentUser, ctx.user))
      : Effect.fail(error({ code: 'UNAUTHORIZED' })),
);

export const standaloneEffect = middleware.effect<{
  ctx: { user: User | null };
}>()(({ next }) => next({ ctx: { at: 0 } }));

export const declared = t.procedure
  .errors({ NOT_FOUND: { data: z.object({ id: z.string() }) } })
  .route({ method: 'GET', path: '/posts/{id}' });

const pluginT = initTrpc<{ ctx: { user: User } }>();
export const orgPlugin = pluginT.procedure
  .input(z.object({ orgId: z.string() }))
  .use(({ input, next }) => next({ ctx: { orgId: input.orgId } }));

export const postRouter = {
  byId: t.procedure
    .input(Schema.Struct({ id: Schema.String }))
    .query(({ input }) =>
      Effect.gen(function* () {
        const post = yield* (yield* PostRepo).find(input.id);
        if (!post) {
          return yield* error({ code: 'NOT_FOUND', data: { id: input.id } });
        }
        return post;
      }),
    ),
  create: authed
    .use(requireAdmin)
    .concat(orgPlugin)
    .input(z.object({ title: z.string() }))
    .mutation(({ ctx, input }) => ({ ...input, orgId: ctx.orgId })),
  feed: t.procedure.query(() => ({
    first: 'a',
    rest: (async function* () {
      yield 'b';
    })(),
  })),
  onPost: t.procedure.subscription(async function* () {
    yield tracked('1', { id: '1' });
  }),
  ticks: t.procedure.subscription(() => Stream.make(1, 2, 3)),
  find: declared
    .input(z.object({ id: z.string() }))
    .query(({ input, errors }) => errors.NOT_FOUND({ data: { id: input.id } })),
  me: t.procedure
    .use(withCurrentUser)
    .use(standaloneEffect)
    .use(onFinish(() => undefined))
    .query(() =>
      Effect.gen(function* () {
        return yield* CurrentUser;
      }),
    ),
  cached: t.procedure
    .use(({ next }) => (Math.random() > 2 ? ok('hit') : next()))
    .mutation(({ response }) => {
      response.status = 201;
      return 'miss';
    }),
};

export const appRouter = mergeRouters(postRouter, {
  health: publicProcedure.query(() => 'ok' as const),
});
export type AppRouter = typeof appRouter;

export const serializer = createSerializer();

export const handler = createFetchHandler({
  router: appRouter,
  createContext: () => ({ user: null }),
  layer: PostRepoLive,
});

export const client = createTrpcClient({
  router: routerType<AppRouter>(),
  links: [link(async ({ op, next }) => next(op)), httpLink({ url: '/trpc' })],
});

export const localClient = createTrpcClient({
  router: routerType<AppRouter>(),
  links: [localLink({ router: appRouter, layer: PostRepoLive })],
});

export const effectClient = createEffectClient<AppRouter>({
  links: [httpLink({ url: '/trpc' })],
});

export const traceLink = link<{ context: { traceId?: string } }>(
  async ({ op, next }) => next(op),
);

export const socket = wsLink({ url: 'ws://localhost/trpc' });

export const typedClient = createTrpcClient({
  router: routerType<AppRouter>(),
  links: [
    traceLink,
    dedupeLink(),
    splitLink<AppRouter>({
      condition: (op) => op.type === 'subscription',
      true: socket,
      false: httpLink({ url: '/trpc' }),
    }),
  ],
});

export const typedEffectClient = createEffectClient({
  router: routerType<AppRouter>(),
  links: [traceLink, httpLink({ url: '/trpc' })],
});

const c = contract.create<{ meta: { scope?: string } }>();

export const userContract = {
  me: c
    .output(Schema.Struct({ id: Schema.String, name: Schema.String }))
    .errors({ UNAUTHORIZED: {} })
    .query(),
  rename: c
    .input(z.object({ name: z.string() }))
    .output(z.object({ name: z.string() }))
    .mutation(),
  presence: c.output(z.string()).subscription({ tracked: true }),
};

export const userImpl = t.implement(userContract);

export const userRouter = userImpl.router({
  me: userImpl.me
    .use(({ ctx, next }) =>
      ctx.user
        ? next({ ctx: { user: ctx.user } })
        : error({ code: 'UNAUTHORIZED' }),
    )
    .query(({ ctx }) => ctx.user),
  rename: userImpl.rename.mutation(({ input }) => input),
  presence: userImpl.presence.subscription(async function* () {
    yield tracked('1', 'online');
  }),
});

export type UserContract = inferContract<typeof userRouter>;
export const userContractJson = toContract(userRouter);

export const contractClient = createTrpcClient({
  router: userContract,
  links: [httpLink({ url: '/trpc' })],
});

export const openapi = createOpenApiHandler({
  router: userRouter,
  createContext: () => ({ user: null }),
  middleware: [
    openApiReference({
      router: userRouter,
      specGenerateOptions: { info: { title: 'Users', version: '1.0.0' } },
    }),
  ],
});

export const openapiDocument = generateOpenApi(userRouter, {
  info: { title: 'Users', version: '1.0.0' },
});

export const restClient = createTrpcClient({
  router: userContractJson,
  links: [openApiLink({ url: '/', contract: userContractJson })],
});

export const caller = createRouterClient(appRouter, {
  ctx: { user: null },
  layer: PostRepoLive,
});
