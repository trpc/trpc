import { describe, expectTypeOf, test } from 'vite-plus/test';
import {
  contract,
  createClient,
  initTrpc,
  lazy,
  mergeRouters,
  schema,
  type ContractProcedure,
  type ImplementedRouter,
  type inferContract,
} from './core.ts';

interface Post {
  id: string;
  title: string;
}
declare const db: {
  find(id: string): Promise<Post | undefined>;
  create(p: { title: string }): Promise<Post>;
};

const c = contract.create<{ meta: { auth?: boolean } }>();
const appContract = {
  post: {
    byId: c
      .route({ method: 'GET', path: '/posts/{id}' })
      .input(schema<{ id: string }>())
      .output(schema<Post>())
      .errors({ NOT_FOUND: { data: schema<{ id: string }>() } })
      .query(),
    create: c
      .input(schema<{ title: string }>())
      .output(schema<Post>())
      .mutation(),
  },
  health: c.output(schema<'ok'>()).query(),
};

const t = initTrpc<{ db: typeof db; user?: { id: string } }>();

describe('09 Q9.1: contract syntax', () => {
  test('terminal and options-bag forms produce the same contract type', () => {
    const bag = c.procedure({
      type: 'query',
      input: schema<{ id: string }>(),
      output: schema<Post>(),
      errors: { NOT_FOUND: { data: schema<{ id: string }>() } },
      route: { method: 'GET', path: '/posts/{id}' },
    });
    expectTypeOf(bag).toEqualTypeOf(appContract.post.byId);
  });
});

describe('09 Q9.2 (a): t.implement(contract)', () => {
  const impl = t.implement(appContract);

  test('leaves are pre-typed; a complete router is accepted', () => {
    const router = impl.router({
      post: {
        byId: impl.post.byId
          .use(({ ctx, next }) => next({ ctx: { user: ctx.user! } }))
          .query(async ({ input, ctx, errors }) => {
            expectTypeOf(input).toEqualTypeOf<{ id: string }>();
            expectTypeOf(ctx.user).toEqualTypeOf<{ id: string }>();
            expectTypeOf(errors).toHaveProperty('NOT_FOUND');
            const post = await ctx.db.find(input.id);
            if (!post) throw errors.NOT_FOUND({ data: { id: input.id } });
            return post;
          }),
        create: impl.post.create.mutation(({ input, ctx }) =>
          ctx.db.create(input),
        ),
      },
      health: impl.health.query(() => 'ok' as const),
    });
    expectTypeOf<inferContract<typeof router>>().toEqualTypeOf<
      typeof appContract
    >();
  });

  test('only the matching terminal exists, and .input() is not available', () => {
    // @ts-expect-error byId is a query
    impl.post.byId.mutation(() => ({ id: '1', title: '' }));
    // @ts-expect-error input comes from the contract
    impl.post.byId.input(schema<{ id: number }>());
  });

  test('wrong output is an error on the resolver', () => {
    // @ts-expect-error title is missing
    impl.post.create.mutation(() => ({ id: '1' }));
  });

  test('missing and extra procedures are errors on impl.router()', () => {
    const health = impl.health.query(() => 'ok' as const);
    const create = impl.post.create.mutation(({ input, ctx }) =>
      ctx.db.create(input),
    );
    const byId = impl.post.byId.query(async () => ({ id: '1', title: '' }));

    // @ts-expect-error post.create is missing
    impl.router({ post: { byId }, health });
    // @ts-expect-error post.delete is not in the contract
    impl.router({ post: { byId, create, delete: create }, health });
    // @ts-expect-error health is implemented with the wrong procedure
    impl.router({ post: { byId, create }, health: byId });
  });
});

describe('09 Q9.2 (b): t.procedure.implements(contract.x)', () => {
  test('per-procedure implementation; completeness needs a separate check', () => {
    const byId = t.procedure
      .implements(appContract.post.byId)
      .query(async ({ input }) => {
        expectTypeOf(input).toEqualTypeOf<{ id: string }>();
        return { id: '1', title: '' };
      });
    const create = t.procedure
      .implements(appContract.post.create)
      .mutation(({ input, ctx }) => ctx.db.create(input));
    const health = t.procedure
      .implements(appContract.health)
      .query(() => 'ok' as const);

    const router = {
      post: { byId, create },
      health,
    } satisfies ImplementedRouter<typeof appContract>;
    void router;
    // Without `satisfies`, a missing procedure is silent:
    const incomplete = { post: { byId }, health };
    void incomplete;
    // @ts-expect-error post.create is missing
    void ({ post: { byId }, health } satisfies ImplementedRouter<
      typeof appContract
    >);
  });
});

describe('09 implementation-first: inferContract and the client', () => {
  const router = {
    post: {
      byId: t.procedure
        .input(schema<{ id: string }>())
        .query(async ({ input }): Promise<Post> => ({
          id: input.id,
          title: '',
        })),
    },
  };
  type Contract = inferContract<typeof router>;

  test('inferContract drops ctx', () => {
    expectTypeOf<Contract['post']['byId']>().toEqualTypeOf<
      ContractProcedure<'query', { id: string }, { id: string }, Post, {}>
    >();
    expectTypeOf<Contract['post']['byId']>().not.toHaveProperty('~ctx');
  });

  test('a router and its contract produce the same client', () => {
    expectTypeOf(createClient<typeof router>()).toEqualTypeOf(
      createClient<Contract>(),
    );
    const client = createClient<typeof appContract>();
    expectTypeOf(client.post.byId.query).parameters.toEqualTypeOf<
      [{ id: string }]
    >();
    expectTypeOf(
      client.post.create.mutate,
    ).returns.resolves.toEqualTypeOf<Post>();
  });
});

describe('08: plain-object routers', () => {
  const a = { x: t.procedure.query(() => 1), y: t.procedure.query(() => 'a') };
  const b = { y: t.procedure.query(() => true) };

  test('spread silently overwrites duplicate keys (no error possible)', () => {
    const merged = { ...a, ...b };
    expectTypeOf(
      createClient<typeof merged>().y.query,
    ).returns.resolves.toEqualTypeOf<boolean>();
  });

  test('an explicit key before a spread that contains it is TS2783', () => {
    // @ts-expect-error 'y' is specified more than once
    void { y: a.y, ...b };
  });

  test('a variadic merge helper can reject duplicates', () => {
    const merged = mergeRouters(a, { z: t.procedure.query(() => null) });
    expectTypeOf(
      createClient<typeof merged>().z.query,
    ).returns.resolves.toEqualTypeOf<null>();
    // @ts-expect-error 'y' is in both
    mergeRouters(a, b);
  });

  test('lazy accepts default and named exports; client and contract unwrap it', () => {
    const router = {
      adminDefault: lazy(() => import('./fixtures/admin.ts')),
      adminNamed: lazy(() =>
        import('./fixtures/admin.ts').then((m) => m.adminRouter),
      ),
    };
    const client = createClient<typeof router>();
    expectTypeOf(
      client.adminDefault.stats.query,
    ).returns.resolves.toEqualTypeOf<{
      users: number;
    }>();
    expectTypeOf(client.adminNamed.ban.mutate).parameters.toEqualTypeOf<
      [{ userId: string }]
    >();
    expectTypeOf<
      inferContract<typeof router>['adminDefault']['stats']
    >().toEqualTypeOf<
      ContractProcedure<'query', undefined, undefined, { users: number }, {}>
    >();
  });
});
