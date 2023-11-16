import {
  composeMiddlewares,
  experimental_standaloneInputMiddleware,
  experimental_standaloneMiddleware,
  initTRPC,
  TRPCError,
} from '@trpc/server/src';
import * as z from 'zod';

test('decorate independently', () => {
  type User = {
    id: string;
    name: string;
  };
  type Context = {
    user: User;
  };
  const t = initTRPC.context<Context>().create();

  t.middleware((opts) => {
    expectTypeOf(opts.ctx.user).toEqualTypeOf<User>();
    return opts.next({
      ctx: {
        // ...opts.ctx,
        foo: 'foo' as const,
      },
    });
  });
});

test('standalone middlewares that define the ctx/input they require and can be used in different tRPC instances', () => {
  type Human = {
    id: string;
    name: string;
  };
  type HumanContext = {
    user: Human;
  };
  const tHuman = initTRPC.context<HumanContext>().create();

  type Alien = {
    id: string;
    name: Buffer; // aliens have weird names
  };
  type AlienContext = {
    user: Alien;
    planet: 'mars' | 'venus';
  };
  const tAlien = initTRPC.context<AlienContext>().create();

  const addFooToCtxMiddleware = experimental_standaloneMiddleware().create(
    (opts) => {
      expectTypeOf(opts.ctx).toEqualTypeOf<object>();
      return opts.next({
        ctx: {
          foo: 'foo' as const,
        },
      });
    },
  );

  type Dog = {
    type: 'dog';
    breed: string;
  };
  type Cat = {
    type: 'cat';
    breed: string;
  };
  const addDogToCtxMiddleware = experimental_standaloneMiddleware().create(
    (opts) => {
      return opts.next({
        ctx: {
          animal: {
            type: 'dog' as const,
          },
        },
      });
    },
  );

  const addDogBreedToCtxMiddleware = experimental_standaloneMiddleware<{
    ctx: { animal: Pick<Dog, 'type'> };
    input: { breed: string };
  }>().create((opts) => {
    return opts.next({
      ctx: {
        animal: {
          ...opts.ctx.animal,
          breed: opts.input.breed,
        },
      },
    });
  });

  const determineFancinessOfCatBreed = experimental_standaloneMiddleware<{
    ctx: { animal: Cat };
  }>().create((opts) => {
    return opts.next({
      ctx: {
        fancy: opts.ctx.animal.breed === 'persian',
      },
    });
  });

  const determineFancinessOfDogBreed = experimental_standaloneMiddleware<{
    ctx: { animal: Dog };
  }>().create((opts) => {
    return opts.next({
      ctx: {
        fancy: opts.ctx.animal.breed === 'corgi',
      },
    });
  });

  const breedParser = experimental_standaloneInputMiddleware(
    z.object({ breed: z.string() }),
  );
  const creedParser = experimental_standaloneInputMiddleware(
    z.object({ creed: z.string() }),
  );

  const composedMiddlewares = composeMiddlewares(
    addDogToCtxMiddleware,
    breedParser,
    creedParser,
    addDogBreedToCtxMiddleware,
    determineFancinessOfDogBreed,
  );

  const t = initTRPC.create();

  t.procedure
    .use(composedMiddlewares)
    .query(({ ctx, input }) => ({ ctx, input }));

  const addUserNameLengthToCtxMiddleware = experimental_standaloneMiddleware<{
    ctx: { user: Human | Alien };
  }>().create((opts) => {
    expectTypeOf(opts.ctx).toEqualTypeOf<{
      user: Human | Alien;
    }>();
    return opts.next({
      ctx: {
        nameLength: opts.ctx.user.name.length,
      },
    });
  });

  const determineIfUserNameIsLongMiddleware =
    experimental_standaloneMiddleware<{
      ctx: { nameLength: number };
    }>().create((opts) => {
      expectTypeOf(opts.ctx).toEqualTypeOf<{
        nameLength: number;
      }>();

      return opts.next({
        ctx: {
          nameIsLong: opts.ctx.nameLength > 10,
        },
      });
    });

  const mapUserToUserTypeMiddleware = experimental_standaloneMiddleware<{
    ctx: { user: Human | Alien };
  }>().create((opts) => {
    expectTypeOf(opts.ctx).toEqualTypeOf<{
      user: Human | Alien;
    }>();
    return opts.next({
      ctx: {
        user:
          typeof opts.ctx.user.name === 'string'
            ? ('human' as const)
            : ('alien' as const),
      },
    });
  });

  const composed = composeMiddlewares(
    addUserNameLengthToCtxMiddleware,
    addFooToCtxMiddleware,
    determineIfUserNameIsLongMiddleware,
    mapUserToUserTypeMiddleware,
  );

  tHuman.procedure
    .input(z.string())
    .use(composed)
    .query((opts) => {
      const { ctx, input } = opts;
      ctx;
      // ^?
      input;
      // ^?
    });

  // This is not OK because determineIfUserNameIsLongMiddleware requires { nameLength: number } which is not in either context:
  tHuman.procedure.use(
    // @ts-expect-error: no user in context
    determineIfUserNameIsLongMiddleware,
  );
  tAlien.procedure.use(
    // @ts-expect-error: no user in context
    determineIfUserNameIsLongMiddleware,
  );

  // This is not OK because determineIfUserNameIsLongMiddleware requires { nameLength: number } which is not in HumanContext & { foo: string }
  tHuman.procedure
    .use(addFooToCtxMiddleware)
    // @ts-expect-error: no nameLength in context
    .use(determineIfUserNameIsLongMiddleware);

  // This is OK because the context provides { user: Human } or { user: Alien } which is what addUserNameLengthToCtx requires
  tHuman.procedure
    .use(addFooToCtxMiddleware)
    .use(addUserNameLengthToCtxMiddleware)
    // determineIfUserNameIsLongMiddleware only needs { nameLength: number }, so overwriting user is fine
    .use(mapUserToUserTypeMiddleware)
    .use(determineIfUserNameIsLongMiddleware)
    .query(({ ctx }) => {
      expectTypeOf(ctx).toEqualTypeOf<{
        user: 'human' | 'alien';
        nameLength: number;
        nameIsLong: boolean;
        foo: 'foo';
      }>();
    });

  tAlien.procedure
    .use(addFooToCtxMiddleware)
    .use(addUserNameLengthToCtxMiddleware)
    // determineIfUserNameIsLongMiddleware only needs { nameLength: number }, so overwriting user is fine
    .use(mapUserToUserTypeMiddleware)
    .use(determineIfUserNameIsLongMiddleware)
    .query(({ ctx }) => {
      expectTypeOf(ctx).toEqualTypeOf<{
        user: 'human' | 'alien';
        nameLength: number;
        nameIsLong: boolean;
        planet: 'mars' | 'venus';
        foo: 'foo';
      }>();
    });

  const requireUserAndAddFooToCtxMiddleware =
    experimental_standaloneMiddleware<{
      ctx: { user: Human | Alien };
    }>().create((opts) => {
      expectTypeOf(opts.ctx).toEqualTypeOf<{
        user: Human | Alien;
      }>();
      return opts.next({
        ctx: {
          foo: 'foo' as const,
        },
      });
    });

  // Middleware chain using standalone middleware that requires a particular 'input' shape
  const ensureMagicNumberIsNotLongerThanNameLength =
    experimental_standaloneMiddleware<{
      ctx: { nameLength: number };
      input: { magicNumber: number };
    }>().create((opts) => {
      expectTypeOf(opts.ctx).toEqualTypeOf<{
        nameLength: number;
      }>();
      expectTypeOf(opts.input).toEqualTypeOf<{
        magicNumber: number;
      }>();

      if (opts.input.magicNumber > opts.ctx.nameLength) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'magicNumber is too high',
        });
      }

      return opts.next();
    });

  // This is not OK because the input is not compatible with the middleware (magicNumber must always be number)
  tHuman.procedure
    .input(z.object({ magicNumber: z.number().optional() }))
    .use(addUserNameLengthToCtxMiddleware)
    // @ts-expect-error: magicNumber is required
    .use(ensureMagicNumberIsNotLongerThanNameLength);

  // This is OK because the input is compatible with the middleware
  tHuman.procedure
    .input(z.object({ magicNumber: z.number() }))
    .use(addUserNameLengthToCtxMiddleware)
    .use(ensureMagicNumberIsNotLongerThanNameLength)
    .query(({ input, ctx }) => {
      expectTypeOf(ctx).toEqualTypeOf<{
        user: Human;
        nameLength: number;
      }>();
      expectTypeOf(input).toEqualTypeOf<{
        magicNumber: number;
      }>();
    });

  // Middleware that defines a particular 'meta' shape
  const shamefullyLogIfProcedureIsNotCoolMiddleware =
    experimental_standaloneMiddleware<{
      meta: {
        cool: boolean;
      };
    }>().create((opts) => {
      expectTypeOf(opts.meta).toEqualTypeOf<
        | {
            cool: boolean;
          }
        | undefined
      >();

      if (!opts.meta?.cool) {
        globalThis.console.log('This procedure is not cool');
      }

      return opts.next();
    });

  // This is not OK because the meta is not compatible with the middleware (cool must always be boolean)
  const tHumanWithWrongMeta = initTRPC
    .context<HumanContext>()
    .meta<{ cool: string }>()
    .create();
  tHumanWithWrongMeta.procedure
    .meta({ cool: 'true' })
    // @ts-expect-error: cool must be boolean
    .use(shamefullyLogIfProcedureIsNotCoolMiddleware);

  // This is OK because the meta is compatible with the middleware
  const tHumanWithMeta = initTRPC
    .context<HumanContext>()
    .meta<{ cool: boolean }>()
    .create();

  tHumanWithMeta.procedure
    .meta({ cool: false })
    .use(shamefullyLogIfProcedureIsNotCoolMiddleware);

  // Works without the .meta() addition as well, since Meta is always a union with undefined
  tHumanWithMeta.procedure.use(shamefullyLogIfProcedureIsNotCoolMiddleware);
});

test('meta', () => {
  type Meta = {
    permissions: string[];
  };
  const t = initTRPC.meta<Meta>().create();

  t.middleware(({ meta, next }) => {
    expectTypeOf(meta).toMatchTypeOf<Meta | undefined>();

    return next();
  });
});
