/**
 * Stand-ins for the avatar tests: a local server that answers each path
 * as told, and `Avatars` on it with short timeouts. `await using` closes
 * the server.
 */
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { makeAsyncResource } from '@trpc/server/unstable-core-do-not-import';
import { type Duration, Layer, ManagedRuntime } from 'effect';
import { FetchHttpClient } from 'effect/http';
import { Persistence } from 'effect/persistence';

import { Avatars } from './avatar.ts';
import type { CardFooter, CardSponsor } from './card.ts';
import {
  layerBackingRuntimeCache,
  type RuntimeCacheStore,
} from './runtime-cache.ts';

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

/** A card's foot with `partners` and `backers`: none unless given. */
export const footerWith = (
  partners: ReadonlyArray<CardSponsor> = [],
  backers: ReadonlyArray<CardSponsor> = [],
): CardFooter => ({
  backers,
  faceSlots: 12,
  partners,
  sponsorCount: partners.length + backers.length,
});

/** `Avatars` with a 200ms timeout, tried again twice. */
export const testAvatars = Avatars.layer({
  retries: 2,
  timeout: '200 millis',
}).pipe(Layer.provide(FetchHttpClient.layer));

/** A `RuntimeCacheStore` in a map, as Vercel's Runtime Cache, ignoring expiry. */
export const mapCache = () => {
  const kept = new Map<
    string,
    {
      readonly tags: Array<string>;
      readonly ttl?: number;
      readonly value: unknown;
    }
  >();
  const store: RuntimeCacheStore = {
    delete: async (key) => {
      kept.delete(key);
    },
    expireTag: async (tag) => {
      for (const [key, entry] of kept) {
        if (entry.tags.includes(tag)) {
          kept.delete(key);
        }
      }
    },
    get: async (key) => kept.get(key)?.value ?? null,
    set: async (key, value, options) => {
      kept.set(key, { ...options, value });
    },
  };
  return { kept, store };
};

/**
 * A server instance: `Avatars` with its own memory, keeping avatars that
 * loaded in `store`, which instances can share, `persisted` long, in the
 * period `period` gives.
 */
export const cachedInstance = (
  store: RuntimeCacheStore,
  options: {
    readonly period?: () => string;
    readonly persisted?: () => Duration.Input;
  } = {},
) =>
  ManagedRuntime.make(
    Avatars.layerCached({
      capacity: 10,
      inMemory: () => '1 hour',
      period: options.period ?? (() => 'today'),
      persisted: options.persisted ?? (() => '30 seconds'),
    }).pipe(
      Layer.provide(
        Avatars.layer({ retries: 0, timeout: '2 seconds' }).pipe(
          Layer.provide(FetchHttpClient.layer),
        ),
      ),
      Layer.provide(
        Persistence.layer.pipe(Layer.provide(layerBackingRuntimeCache(store))),
      ),
    ),
  );
