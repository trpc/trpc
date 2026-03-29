import type {
  inferProcedureInput,
  inferProcedureOutput,
  inferRouterInputs,
  inferRouterOutputs,
  inferSubscriptionInput,
  inferSubscriptionOutput,
} from '@trpc/server';
import { initTRPC } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import { z } from 'zod';

const t = initTRPC.create();
const roomProcedure = t.procedure.input(
  z.object({
    roomId: z.string(),
  }),
);
const appRouter = t.router({
  getRoom: roomProcedure.query(({ input }) => {
    return {
      id: input.roomId,
      name: 'This is my room',
      type: 'Best Room',
    };
  }),
  sendMessage: roomProcedure
    .input(
      z.object({
        text: z.string(),
        optionalKey: z.string().min(1).optional(),
      }),
    )
    .mutation(({ input }) => {
      if (input.optionalKey) {
        return { ...input, testField: 'heyo' };
      }
      return input;
    }),
  sendMessage2: roomProcedure
    .input(
      z.object({
        text: z.string(),
      }),
    )
    .mutation(({ input }) => {
      //         ^?
      input.roomId;
      input.text;
      return input;
    }),
  subscriptionWithObservable: roomProcedure.subscription(({ input }) => {
    return observable<{ roomId: string }>((emit) => {
      emit.next({
        roomId: input.roomId,
      });
      emit.complete();
    });
  }),
  subscriptionWithIterable: roomProcedure.subscription(async function* ({
    input,
  }) {
    yield {
      roomId: input.roomId,
      text: 'hello',
    };
  }),
});

// @ts-expect-error alternative async-iterable return values are not supported for subscriptions
roomProcedure.subscription(async function* ({ input }) {
  yield {
    roomId: input.roomId,
    text: 'hello',
  };

  return {
    done: true,
  };
});

type AppRouter = typeof appRouter;

describe('inferProcedureInput', () => {
  test('query procedure', () => {
    type Input = inferProcedureInput<AppRouter['getRoom']>;
    expectTypeOf<Input>().toEqualTypeOf<{ roomId: string }>();
  });

  test('mutation procedure', () => {
    type Input = inferProcedureInput<AppRouter['sendMessage']>;
    expectTypeOf<Input>().toEqualTypeOf<{
      roomId: string;
      text: string;
      optionalKey?: string | undefined;
    }>();
  });
});

describe('inferProcedureOutput', () => {
  test('query procedure', () => {
    type Output = inferProcedureOutput<AppRouter['getRoom']>;
    expectTypeOf<Output>().toEqualTypeOf<{
      id: string;
      name: string;
      type: string;
    }>();
  });

  test('mutation procedure', () => {
    type Output = inferProcedureOutput<AppRouter['sendMessage2']>;
    expectTypeOf<Output>().toEqualTypeOf<{
      roomId: string;
      text: string;
    }>();
  });
});

describe('inferRouterInputs', () => {
  type AppRouterInputs = inferRouterInputs<AppRouter>;

  test('happy path', async () => {
    type Input = AppRouterInputs['getRoom'];
    expectTypeOf({ roomId: 'abcd' }).toEqualTypeOf<Input>();
  });

  test('happy path with optional fields', async () => {
    type Input = AppRouterInputs['sendMessage'];
    expectTypeOf({ roomId: 'abcd', text: 'testing' }).toMatchTypeOf<Input>();
  });

  test('sad path', async () => {
    type Input = AppRouterInputs['sendMessage2'];
    expectTypeOf({ roomId: 2, text: 'testing' }).not.toEqualTypeOf<Input>();
  });
});

describe('inferRouterOutputs', () => {
  type AppRouterOutputs = inferRouterOutputs<AppRouter>;

  test('happy path', async () => {
    type Output = AppRouterOutputs['getRoom'];
    expectTypeOf({
      id: 'abcd',
      name: 'This is my room, too',
      type: 'Best Room part 2',
    }).toEqualTypeOf<Output>();
  });

  test('happy path with optional fields', async () => {
    type Output = AppRouterOutputs['sendMessage'];
    expectTypeOf({
      roomId: 'abcd',
      text: 'testing 1',
    }).toMatchTypeOf<Output>();
    expectTypeOf({
      roomId: 'abcd',
      text: 'testing 2',
      optionalKey: 'this is optional',
    }).toMatchTypeOf<Output>();
    expectTypeOf({
      roomId: 'abcd',
      text: 'testing 3',
      optionalKey: 'this is optional',
      testField: 'hey',
    }).toMatchTypeOf<Output>();
    expectTypeOf({
      roomId: 'abcd',
      text: 'testing 3',
      testField: 'hey',
    }).toMatchTypeOf<Output>();
  });

  test('sad path', async () => {
    type Output = AppRouterOutputs['sendMessage2'];
    expectTypeOf({ roomId: 2, text: 'testing' }).not.toEqualTypeOf<Output>();
  });
});

describe('inferSubscriptionInput', () => {
  test('observable subscription', () => {
    type Input = inferSubscriptionInput<
      AppRouter['subscriptionWithObservable']
    >;
    expectTypeOf<Input>().toEqualTypeOf<{ roomId: string }>();
  });

  test('iterable subscription', () => {
    type Input = inferSubscriptionInput<AppRouter['subscriptionWithIterable']>;
    expectTypeOf<Input>().toEqualTypeOf<{ roomId: string }>();
  });
});

describe('inferSubscriptionOutput', () => {
  test('observable subscription', () => {
    type Output = inferSubscriptionOutput<
      AppRouter['subscriptionWithObservable']
    >;
    expectTypeOf<Output>().toEqualTypeOf<{ roomId: string }>();
  });

  test('iterable subscription', () => {
    type Output = inferSubscriptionOutput<
      AppRouter['subscriptionWithIterable']
    >;
    expectTypeOf<Output>().toEqualTypeOf<{
      roomId: string;
      text: string;
    }>();
  });
});
