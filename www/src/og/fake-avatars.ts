/**
 * Stand-ins for the avatar tests: a local server that answers each path
 * as told, and `Avatars` on it with short timeouts. `await using` closes
 * the server.
 */
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { makeAsyncResource } from '@trpc/server/unstable-core-do-not-import';
import { Layer } from 'effect';
import { FetchHttpClient } from 'effect/http';

import { Avatars } from './avatar.ts';

export interface Answer {
  readonly body?: string | Uint8Array;
  /** How long to wait before answering, in ms. */
  readonly delay?: number;
  readonly status?: number;
  readonly type?: string;
}

/** An answer, or `hang` for none ever. */
export type Reply = Answer | 'hang';

export const png = (bytes: ReadonlyArray<number> = [1, 2, 3]): Answer => ({
  body: new Uint8Array(bytes),
  type: 'image/png',
});

export const svg = (body: string): Answer => ({ body, type: 'image/svg+xml' });

/**
 * Serves `routes`: a path gets its reply, or its replies in turn and then
 * the last again. Any other path is a 404.
 */
export async function serveAvatars(
  routes: Record<string, Reply | ReadonlyArray<Reply>>,
) {
  const hits: Array<string> = [];
  let inFlight = 0;
  let mostInFlight = 0;
  const server = createServer((request, response) => {
    const path = request.url ?? '/';
    const seen = hits.filter((hit) => hit === path).length;
    hits.push(path);
    const given = routes[path];
    const replies = given === undefined ? [] : [given].flat();
    const reply = replies[Math.min(seen, replies.length - 1)] ?? {
      status: 404,
    };
    if (reply === 'hang') {
      return;
    }
    inFlight += 1;
    mostInFlight = Math.max(mostInFlight, inFlight);
    setTimeout(() => {
      inFlight -= 1;
      response
        .writeHead(
          reply.status ?? 200,
          reply.type === undefined ? {} : { 'content-type': reply.type },
        )
        .end(reply.body ?? '');
    }, reply.delay ?? 0);
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address() as AddressInfo;
  const close = async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  };
  return makeAsyncResource(
    {
      hits,
      /** The most requests it was answering at once. */
      get mostInFlight() {
        return mostInFlight;
      },
      url: (path: string) => `http://127.0.0.1:${port}${path}`,
      close,
    },
    close,
  );
}

/** `Avatars` with a 200ms timeout, tried again twice. */
export const testAvatars = Avatars.layer({
  retries: 2,
  timeout: '200 millis',
}).pipe(Layer.provide(FetchHttpClient.layer));
