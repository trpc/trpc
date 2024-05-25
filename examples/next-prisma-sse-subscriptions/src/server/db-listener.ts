import { Post } from '@prisma/client';
import EventEmitter, { on } from 'events';
import postgres from 'postgres';
import { prisma } from './prisma';
import {
  registerAsyncGlobal,
  registerGlobalValue,
} from '~/utils/registerGlobal';

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const postgresClient = registerGlobalValue('postgresClient', () =>
  postgres(process.env.POSTGRES_URL_NON_POOLING!),
);

export type WhoIsTyping = Record<string, 1>;

interface MyEvents {
  add: (data: Post) => void;
  isTypingUpdate: (who: WhoIsTyping) => void;
}
declare interface MyEventEmitter {
  on<TEv extends keyof MyEvents>(event: TEv, listener: MyEvents[TEv]): this;
  off<TEv extends keyof MyEvents>(event: TEv, listener: MyEvents[TEv]): this;
  once<TEv extends keyof MyEvents>(event: TEv, listener: MyEvents[TEv]): this;
  emit<TEv extends keyof MyEvents>(
    event: TEv,
    ...args: Parameters<MyEvents[TEv]>
  ): boolean;
}

class MyEventEmitter extends EventEmitter {
  public toIterable<TEv extends keyof MyEvents>(
    event: TEv,
  ): AsyncIterable<Parameters<MyEvents[TEv]>> {
    return on(this, event);
  }
}
export const dbEvents = registerGlobalValue(
  'db-listener.events',
  () => new MyEventEmitter(),
);

/**
 * Helper to clear isTyping entries that are older than 3 seconds
 */
const clearIsTypingInterval = (() => {
  let interval: ReturnType<typeof setInterval> | null = null;

  return {
    start() {
      if (interval) {
        return;
      }
      interval = setInterval(() => {
        const now = Date.now();
        // cleanup db
        prisma.isTyping
          .deleteMany({
            where: {
              updatedAt: {
                lt: new Date(now - 3e3),
              },
            },
          })
          .catch((error) => {
            console.error({ error }, 'Failed to cleaning up isTyping');
          });
      }, 1000);
      if (interval.unref) {
        interval.unref();
      }
    },
    stop() {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    },
  };
})();

export let currentlyTyping: WhoIsTyping = Object.create(null);
async function pullIsTyping() {
  const isTyping = await prisma.isTyping.findMany({
    where: {
      updatedAt: {
        gte: new Date(Date.now() - 3e3),
      },
    },
  });
  // delete all isTyping
  for (const name of Object.keys(currentlyTyping)) {
    delete currentlyTyping[name];
  }
  for (const { name } of isTyping) {
    currentlyTyping[name] = 1;
  }

  dbEvents.emit('isTypingUpdate', currentlyTyping);

  if (Object.keys(currentlyTyping).length > 0) {
    clearIsTypingInterval.start();
  } else {
    clearIsTypingInterval.stop();
  }
}

registerAsyncGlobal('db-listener.triggers', async () => {
  await pullIsTyping();

  const isTyping = await postgresClient.listen('is_typing', async (data) => {
    try {
      await pullIsTyping();
    } catch (error) {}

    console.log(
      '🚀 Received is_typing event from Postgres: users typing:',
      Object.keys(currentlyTyping).join(', ') || '(none)',
    );
  });

  const newPost = await postgresClient.listen('new_post', async (data) => {
    const post: Post = JSON.parse(data);
    post.createdAt = new Date(post.createdAt);
    post.updatedAt = new Date(post.updatedAt);

    console.log('🚀 Received new_post event from Postgres', post);
    dbEvents.emit('add', post);
  });

  // cleanup function
  return async () => {
    await newPost.unlisten();
    await isTyping.unlisten();
  };
});
