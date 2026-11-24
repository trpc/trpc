/**
 * What the live bar shows: the requests a load sends, and when each result
 * arrives. It isn't needed to use `experimental_load()`; the page's own
 * code is in `-trpc.ts` and `-components/posts.tsx`.
 */
import { z } from 'zod';

export const modes = ['pipelined', 'separate'] as const;
export type Mode = (typeof modes)[number];

/** `?mode=separate`. Without it, or with a mode that doesn't exist, pipelined. */
export const searchSchema = z.object({
  mode: z.enum(modes).optional().catch(undefined),
});

export interface Arrival {
  readonly kind: 'author' | 'posts' | 'team';
  readonly label: string;
  /** Since the load started */
  readonly ms: number;
}

export interface Sent {
  /** When its response ended; `null` while it streams */
  readonly doneMs: number | null;
  readonly ms: number;
}

export interface Run {
  readonly arrivals: ReadonlyArray<Arrival>;
  /** How many results there will be, once the posts are there */
  readonly expected: number | null;
  /** Results that failed, and those that won't come because of them */
  readonly failed: number;
  readonly id: number;
  readonly mode: Mode;
  readonly requests: ReadonlyArray<Sent>;
  readonly startedAt: number;
}

/** The `fetch` a client sends its requests with */
export type Fetch = (
  url: RequestInfo | URL,
  init: RequestInit,
) => Promise<Response>;

/** The shape the page loads, as far as the meter reads it */
type Loaded = Promise<
  ReadonlyArray<{
    readonly author: Promise<{ readonly name: string }>;
    readonly team: Promise<{ readonly name: string }>;
  }>
>;

let current: Run | null = null;
let runs = 0;
const listeners = new Set<() => void>();

function update(id: number, change: (run: Run) => Partial<Run>) {
  if (current?.id !== id) {
    // A response of a load that a reload replaced
    return;
  }
  current = { ...current, ...change(current) };
  for (const listener of listeners) {
    listener();
  }
}

function since(run: Run) {
  return Math.round(performance.now() - run.startedAt);
}

function arrive(id: number, arrival: Omit<Arrival, 'ms'>) {
  update(id, (run) => ({
    arrivals: [...run.arrivals, { ...arrival, ms: since(run) }],
  }));
}

function fail(id: number, count: number) {
  update(id, (run) => ({ failed: run.failed + count }));
}

/**
 * `fetch`, counting each request in the run `id` and seeing when its response
 * ends. A request of a run that a reload replaced isn't counted.
 */
function meteredFetch(id: number): Fetch {
  return async (url, init) => {
    if (current?.id !== id) {
      return fetch(url, init);
    }
    const index = current.requests.length;
    update(id, (run) => ({
      requests: [...run.requests, { doneMs: null, ms: since(run) }],
    }));
    const done = () =>
      update(id, (run) => ({
        requests: run.requests.map((request, i) =>
          i === index ? { ...request, doneMs: since(run) } : request,
        ),
      }));
    let res: Response;
    try {
      res = await fetch(url, init);
    } catch (cause) {
      done();
      throw cause;
    }
    if (!res.body) {
      done();
      return res;
    }
    // The same response, and a copy of its body the meter reads to its end:
    // the link may stop reading once it has every result.
    const [body, copy] = res.body.tee();
    void (async () => {
      const reader = copy.getReader();
      try {
        while (!(await reader.read()).done) {
          // Only its end counts
        }
      } catch {
        // An aborted request has ended too
      }
      done();
    })();
    return new Response(body, {
      headers: res.headers,
      status: res.status,
      statusText: res.statusText,
    });
  };
}

export const meter = {
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  get: () => current,

  /**
   * Starts a run, and records when each part of what `load` returns arrives.
   * `load` gets a `fetch` that counts its requests in this run only.
   */
  track: <T extends Loaded>(mode: Mode, load: (fetch: Fetch) => T): T => {
    const id = ++runs;
    current = {
      arrivals: [],
      expected: null,
      failed: 0,
      id,
      mode,
      requests: [],
      startedAt: performance.now(),
    };
    update(id, () => ({}));

    const loaded = load(meteredFetch(id));
    // Only reads the results: the page still gets each one, or its error.
    loaded.then(
      (posts) => {
        update(id, () => ({ expected: 1 + posts.length * 2 }));
        arrive(id, { kind: 'posts', label: `${posts.length} posts` });
        for (const post of posts) {
          post.author.then(
            (author) => {
              arrive(id, { kind: 'author', label: author.name });
              post.team.then(
                (team) => arrive(id, { kind: 'team', label: team.name }),
                () => fail(id, 1),
              );
            },
            // Its team won't come either
            () => fail(id, 2),
          );
        }
      },
      // Nothing else will come
      () => update(id, () => ({ expected: 1, failed: 1 })),
    );
    return loaded;
  },
};

/** Whether every result came or failed, and every response has ended */
export function isDone(run: Run) {
  return (
    run.expected !== null &&
    run.arrivals.length + run.failed >= run.expected &&
    run.requests.every((request) => request.doneMs !== null)
  );
}

/** When the last result or response came */
export function endMs(run: Run) {
  return Math.max(
    0,
    ...run.arrivals.map((arrival) => arrival.ms),
    ...run.requests.map((request) => request.doneMs ?? 0),
  );
}
