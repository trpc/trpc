import { tracked } from '@trpc/server';
import type { LiveMessage, RowKey } from '../protocol';

/**
 * Turn a feed of live messages into a subscription output whose event ids are
 * the message versions, so `lastEventId` resumes from the last applied commit.
 */
export async function* trackLive<TRow, TKey extends RowKey>(
  feed: AsyncIterable<LiveMessage<TRow, TKey>>,
) {
  for await (const message of feed) {
    yield tracked(String(message.version), message);
  }
}
