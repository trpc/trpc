import { Effect } from 'effect';
import { initTrpc, Publisher } from 'trpcdev/server';
import { z } from 'zod';

export interface Message {
  from: string;
  text: string;
}

/** A room's messages. In a Durable Object, `hibernatingPublisher` provides it. */
export class Messages extends Publisher.Service<
  Messages,
  { message: Message }
>()('Messages') {}

const t = initTrpc<{ ctx: { room: string; greeting: string } }>();

export const appRouter = {
  room: t.procedure.query(({ ctx }) => `${ctx.greeting} from ${ctx.room}`),
  send: t.procedure
    .input(z.object({ from: z.string(), text: z.string().min(1) }))
    .mutation(({ input }) =>
      Effect.as(Messages.publish('message', input), input),
    ),
  // Over a hibernating socket this is kept in the socket's attachment, not a
  // running fiber, so the object sleeps between messages.
  onMessage: t.procedure.subscription(({ lastEventId }) =>
    Messages.subscribe('message', { lastEventId }),
  ),
};
export type AppRouter = typeof appRouter;
