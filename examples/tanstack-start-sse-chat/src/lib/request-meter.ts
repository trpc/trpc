/**
 * What the request meter on the blog pages shows: the requests the browser
 * sends for the blog, and when each query's data arrives. It isn't needed to
 * use nested queries; it only counts. The link sends its requests through
 * `meteredFetch`, and the meter's component watches the query cache.
 */

export interface Sent {
  /** The procedures it asks for, such as `blog.postBySlug` */
  paths: string[];
  /** Since the run started */
  ms: number;
  /** When its response ended; `null` while it streams */
  doneMs: number | null;
}

export interface Arrival {
  /** The procedure, such as `blog.postBySlug` */
  path: string;
  /** Since the run started */
  ms: number;
}

export interface Run {
  id: number;
  /** A run starts with each navigation; the first one when the page loads */
  startedAt: number;
  requests: Sent[];
  arrivals: Arrival[];
}

let current: Run = { id: 0, startedAt: 0, requests: [], arrivals: [] };
const listeners = new Set<() => void>();

function update(id: number, change: (run: Run) => Partial<Run>) {
  if (current.id !== id) {
    // Something of a run that a navigation replaced
    return;
  }
  current = { ...current, ...change(current) };
  for (const listener of listeners) {
    listener();
  }
}

function since(run: Run) {
  return Math.max(0, Math.round(performance.now() - run.startedAt));
}

export const meter = {
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  get: () => current,
  /** Starts a new run, for a navigation */
  start: () => {
    current = {
      id: current.id + 1,
      startedAt: performance.now(),
      requests: [],
      arrivals: [],
    };
    update(current.id, () => ({}));
  },
  /** A query of the blog got its data: now, or at `at`, a `Date.now()` */
  arrive: (path: string, at: number | null) => {
    update(current.id, (run) => {
      const ms =
        at === null
          ? since(run)
          : Math.max(
              0,
              Math.round(at - performance.timeOrigin - run.startedAt),
            );
      return {
        arrivals: [...run.arrivals, { path, ms }].sort((a, b) => a.ms - b.ms),
      };
    });
  },
};

/** The procedures a request asks for, from its URL: `/api/trpc/a,b` */
function pathsOf(url: RequestInfo | URL) {
  const href = url instanceof Request ? url.url : String(url);
  const last = new URL(href, 'http://x').pathname.split('/').pop() ?? '';
  return decodeURIComponent(last).split(',');
}

/**
 * `fetch`, counting each request for the blog in the current run, and seeing
 * when its response ends
 */
export const meteredFetch: typeof fetch = async (url, init) => {
  const paths = pathsOf(url);
  if (!paths.some((path) => path.startsWith('blog.'))) {
    return fetch(url, init);
  }
  const { id } = current;
  const index = current.requests.length;
  update(id, (run) => ({
    requests: [...run.requests, { paths, ms: since(run), doneMs: null }],
  }));
  const done = () =>
    update(id, (run) => ({
      requests: run.requests.map((request, at) =>
        at === index ? { ...request, doneMs: since(run) } : request,
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

/** When the last result or response came */
export function endMs(run: Run) {
  return Math.max(
    0,
    ...run.arrivals.map((it) => it.ms),
    ...run.requests.map((it) => it.doneMs ?? 0),
  );
}
