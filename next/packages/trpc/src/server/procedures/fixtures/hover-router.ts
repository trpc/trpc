import { Context, Effect } from 'effect';
import { experimental_contract } from '@trpc12/trpc/contract';
import { error, initTrpc, middleware, tracked } from '@trpc12/trpc/server';
import { z } from 'zod';

export interface Post {
  id: string;
  title: string;
}

export class Db extends Context.Service<
  Db,
  { readonly find: (id: string) => Post | undefined }
>()('Db') {}

const t = initTrpc<{ ctx: { userId: string | null } }>();
const bare = initTrpc();
const c = experimental_contract.create();

const posts = new Map<string, Post>();

export const postContract = {
  publish: c
    .input(z.object({ id: z.string() }))
    .output(z.object({ id: z.string(), title: z.string() }))
    .errors({ NOT_FOUND: {} })
    .mutation(),
};

const impl = t.implement(postContract);

const withTenant = middleware<{ ctx: { tenant: string } }>()((opts) =>
  opts.next(),
);

export const appRouter = t.router({
  byId: t.procedure
    .input(z.object({ id: z.string() }))
    .query(
      (opts): Post | ReturnType<typeof notFound> =>
        posts.get(opts.input.id) ?? notFound(opts.input.id),
    ),
  health: bare.procedure.query(() => 'ok' as const),
  fromDb: t.procedure.query(() =>
    Effect.gen(function* () {
      const db = yield* Db;
      return db.find('1') ?? null;
    }),
  ),
  validated: t.procedure
    .output(z.object({ id: z.string(), title: z.string() }))
    .errors({ GONE: {} })
    .query((): Post => ({ id: '1', title: 'a' })),
  onPost: bare.procedure.subscription(async function* () {
    yield tracked('1', { id: '1', title: 'a' } satisfies Post);
  }),
  publish: impl.publish.mutation((opts) => ({ id: opts.input.id, title: 'a' })),
  tenant: t.procedure.use(withTenant).query((opts) => opts.ctx.tenant),
});

function notFound(id: string) {
  return error({ code: 'NOT_FOUND', data: { id } });
}
