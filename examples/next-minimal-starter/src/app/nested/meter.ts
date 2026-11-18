/**
 * What the live bar on `/nested` shows: the requests a load sends, and when
 * each result arrives. It isn't needed to use `experimental_nested()`; the
 * page's own code is in `nested-demo.tsx`.
 */

export type Mode = 'pipelined' | 'separate';

/** The mode in `?mode=`: pipelined unless it says `separate` */
export function parseMode(value: unknown): Mode {
  return value === 'separate' ? 'separate' : 'pipelined';
}

export interface Arrival {
  kind: 'posts' | 'author' | 'team';
  label: string;
  /** Since the load started */
  ms: number;
}

export interface Sent {
  ms: number;
  /** When its response ended; `null` while it streams */
  doneMs: number | null;
}

export interface Run {
  id: number;
  mode: Mode;
  startedAt: number;
  requests: Sent[];
  arrivals: Arrival[];
  /** Results that failed, and those that won't come because of them */
  failed: number;
  /** How many results there will be, once the posts are there */
  expected: number | null;
}

/** The `fetch` a client sends its requests with */
export type Fetch = (
  url: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

/** The shape the page loads, as far as the meter reads it */
type Loaded = Promise<
  {
    edges: {
      author: Promise<{
        node: { name: string };
        edges: { team: Promise<{ name: string }> };
      }>;
    };
  }[]
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

function arrive(id: number, kind: Arrival['kind'], label: string) {
  update(id, (run) => ({
    arrivals: [...run.arrivals, { kind, label, ms: since(run) }],
  }));
}

function fail(id: number, count: number) {
  update(id, (run) => ({ failed: run.failed + count }));
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
      id,
      mode,
      startedAt: performance.now(),
      requests: [],
      arrivals: [],
      failed: 0,
      expected: null,
    };
    update(id, () => ({}));

    const loaded = load(meteredFetch(id));
    // Only reads the results: the page still gets each one, or its error
    loaded.then(
      (posts) => {
        update(id, () => ({ expected: 1 + posts.length * 2 }));
        arrive(id, 'posts', `${posts.length} posts`);
        for (const post of posts) {
          post.edges.author.then(
            (author) => {
              arrive(id, 'author', author.node.name);
              author.edges.team.then(
                (team) => arrive(id, 'team', team.name),
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
    update(id, (it) => ({
      requests: [...it.requests, { ms: since(it), doneMs: null }],
    }));
    const done = () =>
      update(id, (it) => ({
        requests: it.requests.map((request, i) =>
          i === index ? { ...request, doneMs: since(it) } : request,
        ),
      }));
    try {
      const res = await fetch(url, init);
      if (!res.body) {
        done();
        return res;
      }
      // The same response, and a copy of its body the meter reads to its end:
      // the link may stop reading once it has every result
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
        status: res.status,
        statusText: res.statusText,
        headers: res.headers,
      });
    } catch (cause) {
      done();
      throw cause;
    }
  };
}

/** Whether every result came or failed, and every response has ended */
export function isDone(run: Run) {
  return (
    run.expected !== null &&
    run.arrivals.length + run.failed >= run.expected &&
    run.requests.every((it) => it.doneMs !== null)
  );
}

/** When the last result or response came */
export function endMs(run: Run) {
  return Math.max(
    0,
    ...run.arrivals.map((it) => it.ms),
    ...run.requests.map((it) => it.doneMs ?? 0),
  );
}
