import postgres from 'postgres';
import { prisma } from './prisma';

/**
 * Events are broadcast with Postgres `NOTIFY` so that every server instance
 * receives them, not just the one that handled the mutation.
 *
 * `NOTIFY` payloads are limited to 8000 bytes, so posts are sent by id.
 */
export type PubSubEvent =
  | { type: 'add'; postId: string; name: string }
  | { type: 'isTyping'; name: string; typing: boolean };

// Channels are shared by the whole database, so scope them to the app's schema
const PG_CHANNEL = `${new URL(process.env.DATABASE_URL!).searchParams.get('schema') ?? 'public'}_events`;

export async function publish(event: PubSubEvent) {
  await prisma.$executeRaw`select pg_notify(${PG_CHANNEL}, ${JSON.stringify(event)})`;
}

/**
 * `LISTEN` needs a connection that isn't behind a transaction pooler.
 * Prisma-only url params are removed, as postgres.js would send them to the server as settings.
 */
function getListenUrl() {
  const url = new URL(process.env.DIRECT_URL ?? process.env.DATABASE_URL!);
  for (const param of ['schema', 'pgbouncer', 'connection_limit']) {
    url.searchParams.delete(param);
  }
  return url.toString();
}

let listenClient: postgres.Sql | null = null;
let listening: Promise<unknown> | null = null;

/**
 * Starts listening once per server instance.
 * Resolves when `LISTEN` is active, so no event published afterwards is missed.
 */
export function listen(onEvent: (event: PubSubEvent) => void) {
  listenClient ??= postgres(getListenUrl(), { max: 1 });
  listening ??= listenClient
    .listen(PG_CHANNEL, (payload) => onEvent(JSON.parse(payload)))
    .catch((cause) => {
      listening = null;
      throw cause;
    });
  return listening;
}
