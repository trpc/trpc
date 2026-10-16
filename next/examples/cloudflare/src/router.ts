import { Effect } from 'effect';
import { experimental_durable } from '@trpc12/trpc/middleware';
import { initTrpc, Publisher } from '@trpc12/trpc/server';
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
  // The streamed output is kept in the object's storage as it's sent, so a
  // client whose connection drops picks up where it stopped.
  digest: t.procedure
    .input(z.object({ topics: z.array(z.string()).min(1) }))
    .use(experimental_durable())
    .mutation(({ input }) => ({
      topics: input.topics.length,
      summaries: (async function* () {
        for (const topic of input.topics) {
          await sleep(20);
          yield { topic, words: sleep(10).then(() => topic.length * 7) };
        }
      })(),
    })),
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export type AppRouter = typeof appRouter;
