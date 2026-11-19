import { createRandom, jitter, type Random } from '../random.ts';

export type RequestStatus = 'aborted' | 'done' | 'error' | 'pending';

export interface NetworkRequest {
  readonly endedAt: number | undefined;
  /**
   * The HTTP request it went in, counted from 1, when the demo's calls share
   * requests. Calls with the same number left the browser together.
   */
  readonly http: number | undefined;
  readonly id: number;
  /** The call: `post.byId({ id: 1 })`. */
  readonly label: string;
  /** Who sent it, when a demo has more than one client: `loader`. */
  readonly origin: string | undefined;
  /** When the server finished it, once it has. */
  readonly servedAt: number | undefined;
  /** When the server started it, if the demo shows the trip apart from it. */
  readonly servingAt: number | undefined;
  readonly startedAt: number;
  readonly status: RequestStatus;
}

/** What happened since a navigation (or a demo's own action) began. */
export interface Trace {
  /** What began it: the URL navigated to. */
  readonly label: string;
  readonly requests: ReadonlyArray<NetworkRequest>;
  /** When the page showed, if it has. */
  readonly shownAt: number | undefined;
  readonly startedAt: number;
}

/**
 * The longest run of requests that each started after the one before it
 * had finished: the round trips the page waited for, one after another.
 */
export function chainLength(requests: ReadonlyArray<NetworkRequest>) {
  const done = requests
    .filter((request) => request.status === 'done')
    .toSorted((a, b) => a.startedAt - b.startedAt);
  const lengths = new Map<number, number>();
  for (const request of done) {
    let before = 0;
    for (const earlier of done) {
      if (
        earlier.endedAt !== undefined &&
        earlier.endedAt <= request.startedAt
      ) {
        before = Math.max(before, lengths.get(earlier.id) ?? 0);
      }
    }
    lengths.set(request.id, before + 1);
  }
  return Math.max(0, ...lengths.values());
}

/**
 * How long a call takes on the server, in ms. It is the same on any
 * connection: only the trip there and back gets longer on a slow one.
 */
export const serverWork = { max: 50, min: 15 } as const;

/** A typical round trip for each choice a demo offers. */
export const latencies = [
  { label: 'Fast', ms: 300 },
  { label: '3G', ms: 800 },
  { label: 'Slow', ms: 2000 },
] as const;

/**
 * A part of an input that isn't known yet, shown as `code` rather than as a
 * value: `‹post›.authorId`.
 */
export class Unfilled {
  readonly code: string;
  constructor(code: string) {
    this.code = code;
  }
}

/** A value as code: `{ id: 1 }`. */
function formatValue(value: unknown): string {
  if (value instanceof Unfilled) {
    return value.code;
  }
  if (typeof value === 'string') {
    return `'${value}'`;
  }
  if (Array.isArray(value)) {
    return `[${value.map(formatValue).join(', ')}]`;
  }
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value).filter(
      ([, entry]) => entry !== undefined,
    );
    return entries.length === 0
      ? '{}'
      : `{ ${entries.map(([key, entry]) => `${key}: ${formatValue(entry)}`).join(', ')} }`;
  }
  return String(value);
}

/** A call as code: `post.byId({ id: 1 })`. */
export function formatCall(path: string, input: unknown) {
  return `${path}(${input === undefined ? '' : formatValue(input)})`;
}

interface Timer {
  readonly at: number;
  readonly run: () => void;
  handle: ReturnType<typeof setTimeout> | undefined;
}

/**
 * A demo's pretend network: every request through it waits about `latency`
 * ms times its weight, give or take a random `jitter`, and shows in the
 * network panel, against the trace it started in. Its clock, `now()`, counts
 * ms since it was created, and stops while it's paused: requests in flight
 * wait, and pick up where they were on `resume()`.
 */
export function createNetwork(random: Random = createRandom(Date.now())) {
  const listeners = new Set<() => void>();
  const createdAt = performance.now();
  let pausedAt: number | undefined;
  let pausedFor = 0;
  const now = () => (pausedAt ?? performance.now()) - createdAt - pausedFor;
  const timers = new Set<Timer>();
  const schedule = (timer: Timer) => {
    timer.handle = setTimeout(
      () => {
        timers.delete(timer);
        timer.run();
      },
      Math.max(0, timer.at - now()),
    );
  };
  let nextId = 1;
  let trace: Trace = {
    label: '',
    requests: [],
    shownAt: undefined,
    startedAt: 0,
  };
  let notifying = false;
  const update = (next: Trace) => {
    trace = next;
    // A query can start while a component renders, and the panel can't
    // update during another component's render.
    if (!notifying) {
      notifying = true;
      queueMicrotask(() => {
        notifying = false;
        for (const listener of listeners) {
          listener();
        }
      });
    }
  };
  const network = {
    begin(label: string) {
      update({
        label,
        // A request still in flight belongs to the new trace too.
        requests: trace.requests.filter(
          (request) => request.status === 'pending',
        ),
        shownAt: undefined,
        startedAt: now(),
      });
    },
    end(id: number, status: Exclude<RequestStatus, 'pending'>) {
      if (
        !trace.requests.some(
          (request) => request.id === id && request.status === 'pending',
        )
      ) {
        return;
      }
      update({
        ...trace,
        requests: trace.requests.map((request) =>
          request.id === id ? { ...request, endedAt: now(), status } : request,
        ),
      });
    },
    /** How long a request of `weight` round trips takes this time, in ms. */
    delay(weight: number) {
      return Math.round(
        network.latency * weight * random.between(jitter.min, jitter.max),
      );
    },
    /** How long a call takes on the server this time, in ms. */
    work() {
      return Math.round(random.between(serverWork.min, serverWork.max));
    },
    /** Calls `run` after `ms` on the network's clock; returns a cancel. */
    after(ms: number, run: () => void) {
      const timer: Timer = { at: now() + ms, handle: undefined, run };
      timers.add(timer);
      if (pausedAt === undefined) {
        schedule(timer);
      }
      return () => {
        timers.delete(timer);
        clearTimeout(timer.handle);
      };
    },
    getTrace: () => trace,
    latency: latencies[1].ms as number,
    now,
    pause() {
      if (pausedAt !== undefined) {
        return;
      }
      pausedAt = performance.now();
      for (const timer of timers) {
        clearTimeout(timer.handle);
      }
    },
    resume() {
      if (pausedAt === undefined) {
        return;
      }
      pausedFor += performance.now() - pausedAt;
      pausedAt = undefined;
      for (const timer of timers) {
        schedule(timer);
      }
    },
    /** Gives a request in flight another label, once more is known of it. */
    relabel(id: number, label: string) {
      update({
        ...trace,
        requests: trace.requests.map((request) =>
          request.id === id ? { ...request, label } : request,
        ),
      });
    },
    /** Marks when the server started a request, or finished it. */
    served(id: number, step: 'end' | 'start') {
      update({
        ...trace,
        requests: trace.requests.map((request) =>
          request.id !== id
            ? request
            : step === 'start'
              ? { ...request, servingAt: request.servingAt ?? now() }
              : { ...request, servedAt: now() },
        ),
      });
    },
    shown() {
      if (trace.shownAt === undefined) {
        update({ ...trace, shownAt: now() });
      }
    },
    /**
     * Starts a request that shows as `label`; returns its id. `http` is the
     * HTTP request it goes in, for calls that share one.
     */
    request(
      label: string,
      origin: string | undefined,
      http: number | undefined,
    ) {
      const id = nextId++;
      update({
        ...trace,
        requests: [
          ...trace.requests,
          {
            endedAt: undefined,
            http,
            id,
            label,
            origin,
            servedAt: undefined,
            servingAt: undefined,
            startedAt: now(),
            status: 'pending',
          },
        ],
      });
      return id;
    },
    start(path: string, input: unknown, origin?: string) {
      return network.request(formatCall(path, input), origin, undefined);
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  return network;
}

export type Network = ReturnType<typeof createNetwork>;

const idleTrace: Trace = {
  label: '',
  requests: [],
  shownAt: undefined,
  startedAt: 0,
};

/** The network of a demo that hasn't started: no requests yet. */
export const idleNetwork: Pick<
  Network,
  'getTrace' | 'latency' | 'now' | 'subscribe'
> = {
  getTrace: () => idleTrace,
  latency: latencies[1].ms,
  now: () => 0,
  subscribe: () => () => {},
};
