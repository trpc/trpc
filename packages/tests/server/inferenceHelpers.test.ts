import type {
  inferProcedureClientError,
  inferSubscriptionClientError,
  TRPCClient,
  TRPCClientError,
} from '@trpc/client';
import type {
  inferProcedureInput,
  inferProcedureOutput,
  inferRouterInputs,
  inferRouterOutputs,
  inferSubscriptionInput,
  inferSubscriptionOutput,
  TRPCDefaultErrorShape,
} from '@trpc/server';
import { createTRPCDeclaredError, initTRPC } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import { z } from 'zod';

const t = initTRPC.create();
const RoomNotFoundError = createTRPCDeclaredError({
  code: 'NOT_FOUND',
  key: 'ROOM_NOT_FOUND',
})
  .data<{
    reason: 'ROOM_NOT_FOUND';
  }>()
  .create({
    constants: {
      reason: 'ROOM_NOT_FOUND' as const,
    },
  });
const MessageBlockedError = createTRPCDeclaredError({
  code: 'FORBIDDEN',
  key: 'MESSAGE_BLOCKED',
})
  .data<{
    reason: 'MESSAGE_BLOCKED';
  }>()
  .create({
    constants: {
      reason: 'MESSAGE_BLOCKED' as const,
    },
  });
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
  getRoomWithRegisteredError: roomProcedure
    .errors([RoomNotFoundError])
    .query(({ input }) => {
      return {
        id: input.roomId,
        name: 'This is my room',
        type: 'Best Room',
      };
    }),
  sendMessageWithRegisteredError: roomProcedure
    .errors([MessageBlockedError])
    .mutation(({ input }) => {
      return input;
    }),
  subscriptionWithRegisteredError: roomProcedure
    .errors([RoomNotFoundError])
    .subscription(async function* ({ input }) {
      yield {
        roomId: input.roomId,
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
type Client = TRPCClient<AppRouter>;

type inferPromiseErrorShape<TPromise> = TPromise extends {
  readonly __errorShape?: infer TErrorShape;
}
  ? TErrorShape
  : never;

type RoomNotFoundDeclaredErrorShape = {
  code: -32004;
  message: 'NOT_FOUND';
  '~': {
    kind: 'declared';
    declaredErrorKey: 'ROOM_NOT_FOUND';
  };
  data: {
    reason: 'ROOM_NOT_FOUND';
  };
};

type MessageBlockedDeclaredErrorShape = {
  code: -32003;
  message: 'FORBIDDEN';
  '~': {
    kind: 'declared';
    declaredErrorKey: 'MESSAGE_BLOCKED';
  };
  data: {
    reason: 'MESSAGE_BLOCKED';
  };
};

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
    expectTypeOf({ roomId: 'abcd', text: 'testing' }).toExtend<Input>();
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
    }).toExtend<Output>();
    expectTypeOf({
      roomId: 'abcd',
      text: 'testing 2',
      optionalKey: 'this is optional',
    }).toExtend<Output>();
    expectTypeOf({
      roomId: 'abcd',
      text: 'testing 3',
      optionalKey: 'this is optional',
      testField: 'hey',
    }).toExtend<Output>();
    expectTypeOf({
      roomId: 'abcd',
      text: 'testing 3',
      testField: 'hey',
    }).toExtend<Output>();
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

describe('inferProcedureClientError', () => {
  test('query procedure', () => {
    type Error = inferProcedureClientError<AppRouter['getRoom']>;
    type Expected = TRPCClientError<{
      transformer: false;
      errorShape: TRPCDefaultErrorShape;
    }>;
    expectTypeOf<Error>().toEqualTypeOf<Expected>();
  });

  test('mutation procedure', () => {
    type Error = inferProcedureClientError<AppRouter['sendMessage']>;
    type Expected = TRPCClientError<{
      transformer: false;
      errorShape: TRPCDefaultErrorShape;
    }>;
    expectTypeOf<Error>().toEqualTypeOf<Expected>();
  });

  test('subscription procedure', () => {
    type Error = inferProcedureClientError<
      AppRouter['subscriptionWithIterable']
    >;
    type Expected = TRPCClientError<{
      transformer: false;
      errorShape: TRPCDefaultErrorShape;
    }>;
    expectTypeOf<Error>().toEqualTypeOf<Expected>();
  });

  test('query procedure with registered errors matches client reality', () => {
    type Error = inferProcedureClientError<
      AppRouter['getRoomWithRegisteredError']
    >;
    type ClientErrorShape = inferPromiseErrorShape<
      ReturnType<Client['getRoomWithRegisteredError']['query']>
    >;
    type ClientError = TRPCClientError<{
      transformer: false;
      errorShape: ClientErrorShape;
    }>;

    expectTypeOf<Error>().toEqualTypeOf<ClientError>();
  });

  test('mutation procedure with registered errors matches client reality', () => {
    type Error = inferProcedureClientError<
      AppRouter['sendMessageWithRegisteredError']
    >;
    type ClientErrorShape = inferPromiseErrorShape<
      ReturnType<Client['sendMessageWithRegisteredError']['mutate']>
    >;
    type ClientError = TRPCClientError<{
      transformer: false;
      errorShape: ClientErrorShape;
    }>;

    expectTypeOf<Error>().toEqualTypeOf<ClientError>();
  });
});

describe('inferSubscriptionClientError', () => {
  test('observable subscription', () => {
    type SubscriptionError = inferSubscriptionClientError<
      AppRouter['subscriptionWithObservable']
    >;
    type ProcedureError = inferProcedureClientError<
      AppRouter['subscriptionWithObservable']
    >;
    expectTypeOf<SubscriptionError>().toEqualTypeOf<ProcedureError>();
  });

  test('iterable subscription', () => {
    type SubscriptionError = inferSubscriptionClientError<
      AppRouter['subscriptionWithIterable']
    >;
    type ProcedureError = inferProcedureClientError<
      AppRouter['subscriptionWithIterable']
    >;
    expectTypeOf<SubscriptionError>().toEqualTypeOf<ProcedureError>();
  });

  test('registered subscription matches client reality', () => {
    type SubscriptionError = inferSubscriptionClientError<
      AppRouter['subscriptionWithRegisteredError']
    >;
    type ProcedureError = inferProcedureClientError<
      AppRouter['subscriptionWithRegisteredError']
    >;
    type ClientSubscriptionError = Parameters<
      NonNullable<
        Parameters<
          Client['subscriptionWithRegisteredError']['subscribe']
        >[1]['onError']
      >
    >[0];

    expectTypeOf<SubscriptionError>().toEqualTypeOf<ProcedureError>();
    expectTypeOf<SubscriptionError>().toEqualTypeOf<ClientSubscriptionError>();
  });
});
