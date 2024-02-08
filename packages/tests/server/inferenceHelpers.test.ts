import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import { initTRPC } from '@trpc/server';
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
});
type AppRouter = typeof appRouter;

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
