/**
 * What the request meter on the blog's pages shows: the requests the browser
 * sends to the showcase's endpoint, and when each query's data arrives. It
 * isn't needed to use nested queries; it only counts. The link sends its
 * requests through `meteredFetch`, and the meter's component watches the
 * query cache.
 */

export interface Sent {
  /** The procedures it asks for, such as `blog.postBySlug` */
  readonly paths: ReadonlyArray<string>;
  /** Since the run started */
  readonly ms: number;
  /** When its response ended; `null` while it streams */
  readonly doneMs: number | null;
}

export interface Arrival {
  /** The procedure, such as `blog.postBySlug` */
  readonly path: string;
  /** Since the run started */
  readonly ms: number;
}

export interface Run {
  readonly id: number;
  /** A run starts with each navigation; the first one when the page loads */
  readonly startedAt: number;
  readonly requests: ReadonlyArray<Sent>;
  readonly arrivals: ReadonlyArray<Arrival>;
}

/** The run before anything happened: what the server renders, too */
export const firstRun: Run = {
  arrivals: [],
  id: 0,
  requests: [],
  startedAt: 0,
};

let current = firstRun;
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
  /** The server counts nothing, so the page it renders shows the first run */
  getServer: () => firstRun,
  /** Starts a new run: the blog's route calls it before each navigation's loaders */
  start: () => {
    current = {
      arrivals: [],
      id: current.id + 1,
      requests: [],
      startedAt: performance.now(),
    };
    update(current.id, () => ({}));
  },
  /**
   * A query of the blog got its data: now, or at `at`, a `Date.now()`. It
   * counts in the run it started in, `id`, and not in one a navigation began
   * since
   */
  arrive: (opts: {
    readonly id: number;
    readonly path: string;
    readonly at: number | null;
  }) => {
    update(opts.id, (run) => {
      const ms =
        opts.at === null
          ? since(run)
          : Math.max(
              0,
              Math.round(opts.at - performance.timeOrigin - run.startedAt),
            );
      return {
        arrivals: [...run.arrivals, { ms, path: opts.path }].toSorted(
          (a, b) => a.ms - b.ms,
        ),
      };
    });
  },
};

/** The procedures a request asks for, from its URL: `…/api/a,b` */
function pathsOf(url: RequestInfo | URL) {
  const href = url instanceof Request ? url.url : String(url);
  const last = new URL(href, 'http://x').pathname.split('/').pop() ?? '';
  return decodeURIComponent(last).split(',');
}

/**
 * `fetch`, counting each request in the current run, and seeing when its
 * response ends
 */
export const meteredFetch = async (
  url: RequestInfo | URL,
  init: RequestInit | undefined,
) => {
  const { id } = current;
  const index = current.requests.length;
  update(id, (run) => ({
    requests: [
      ...run.requests,
      { doneMs: null, ms: since(run), paths: pathsOf(url) },
    ],
  }));
  const done = () =>
    update(id, (run) => ({
      requests: run.requests.map((request, at) =>
        at === index ? { ...request, doneMs: since(run) } : request,
      ),
    }));
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (cause) {
    done();
    throw cause;
  }
  if (res.body === null) {
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
    headers: res.headers,
    status: res.status,
    statusText: res.statusText,
  });
};

/** When the last result or response came */
export function endMs(run: Run) {
  return Math.max(
    0,
    ...run.arrivals.map((it) => it.ms),
    ...run.requests.map((it) => it.doneMs ?? 0),
  );
}
