import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import { db, DIRECT_DB_URL } from './db/client';

/**
 * Events are broadcast with Postgres `NOTIFY` so that every server instance
 * receives them, not just the one that handled the mutation.
 *
 * `NOTIFY` payloads are limited to 8000 bytes, so posts are sent by id.
 */
export type PubSubEvent =
  | { type: 'add'; channelId: string; postId: string; name: string }
  | { type: 'isTyping'; channelId: string; name: string; typing: boolean };

const PG_CHANNEL = 'sse_chat_events';

export async function publish(event: PubSubEvent) {
  await db.execute(
    sql`select pg_notify(${PG_CHANNEL}, ${JSON.stringify(event)})`,
  );
}

const listenClient = postgres(DIRECT_DB_URL, { max: 1 });
let listening: Promise<unknown> | null = null;

/**
 * Starts listening once per server instance.
 * Resolves when `LISTEN` is active, so no event published afterwards is missed.
 */
export function listen(onEvent: (event: PubSubEvent) => void) {
  listening ??= listenClient
    .listen(PG_CHANNEL, (payload) => onEvent(JSON.parse(payload)))
    .catch((cause) => {
      listening = null;
      throw cause;
    });
  return listening;
}
