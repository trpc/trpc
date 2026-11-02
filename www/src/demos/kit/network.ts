export type RequestStatus = 'aborted' | 'done' | 'error' | 'pending';

export interface NetworkRequest {
  readonly endedAt: number | undefined;
  readonly id: number;
  /** The call: `post.byId({ id: 1 })`. */
  readonly label: string;
  /** Who sent it, when a demo has more than one client: `loader`. */
  readonly origin: string | undefined;
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

/** The latencies a demo offers, one way. */
export const latencies = [
  { label: 'Fast', ms: 300 },
  { label: '3G', ms: 800 },
  { label: 'Slow', ms: 2000 },
] as const;

/** A value as code: `{ id: 1 }`. */
function formatValue(value: unknown): string {
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

/**
 * A demo's pretend network: every request through it waits `latency` ms and
 * shows in the network panel, against the trace it started in.
 */
export function createNetwork() {
  const listeners = new Set<() => void>();
  let nextId = 1;
  let trace: Trace = {
    label: '',
    requests: [],
    shownAt: undefined,
    startedAt: performance.now(),
  };
  const update = (next: Trace) => {
    trace = next;
    for (const listener of listeners) {
      listener();
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
        startedAt: performance.now(),
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
          request.id === id
            ? { ...request, endedAt: performance.now(), status }
            : request,
        ),
      });
    },
    getTrace: () => trace,
    latency: latencies[1].ms as number,
    shown() {
      if (trace.shownAt === undefined) {
        update({ ...trace, shownAt: performance.now() });
      }
    },
    start(path: string, input: unknown, origin?: string) {
      const id = nextId++;
      update({
        ...trace,
        requests: [
          ...trace.requests,
          {
            endedAt: undefined,
            id,
            label: formatCall(path, input),
            origin,
            startedAt: performance.now(),
            status: 'pending',
          },
        ],
      });
      return id;
    },
    startedAt: performance.now(),
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
