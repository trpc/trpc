/** A request a demo's app sent, as the requests panel shows it. */
export interface DemoRequest {
  /** Pretty-printed when it's JSON. */
  readonly body: string | undefined;
  readonly endedAt: number | undefined;
  readonly id: number;
  readonly method: string;
  /** The path and query, decoded: `/trpc/profile.get`. */
  readonly path: string;
  /** What came back, pretty-printed when it's JSON, or why nothing did. */
  readonly response: string | undefined;
  readonly startedAt: number;
  /** `undefined` while it's pending, or when it never got a response. */
  readonly status: number | undefined;
  readonly outcome: 'aborted' | 'failed' | 'pending' | 'responded';
}

/**
 * `fetch` without its extras: the site's Bun types add `fetch.preconnect`,
 * which a demo's links never call.
 */
export type Fetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

/** The server a demo's network sends to: its tRPC handler. */
export interface DemoServer {
  fetch(request: Request): Promise<Response>;
}

/** A pretend network between a demo's client and its server. */
export interface DemoNetwork {
  readonly fetch: Fetch;
  /** How long each request takes to arrive, in ms. */
  latency: number;
  /** Makes the next `count` requests fail as if the network dropped. */
  failNext(count?: number): void;
  readonly failures: number;
  /** The latest 50, oldest first. */
  readonly requests: ReadonlyArray<DemoRequest>;
  subscribe(listener: () => void): () => void;
}

/** The latencies a demo's toolbar offers. A network starts at `3G`. */
export const latencies = [
  { label: 'Fast', ms: 150 },
  { label: '3G', ms: 700 },
  { label: 'Slow', ms: 2500 },
] as const;

/** Where a demo's requests go: an origin of their own, never the site's. */
const origin = 'https://kitchen-sink.trpc.local';

function pretty(text: string) {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

function wait(ms: number, signal: AbortSignal | null | undefined) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      resolve();
    }, ms);
    if (signal?.aborted) {
      abort();
    }
    signal?.addEventListener('abort', abort, { once: true });
  });
}

/**
 * A pretend network between a demo's client and its server, both in this
 * page: `fetch` waits `latency` ms (± 25%), then hands the request to the
 * server's handler, and logs both sides for the requests panel.
 * `failNext()` makes the next request fail like a dropped connection.
 */
export function createNetwork(server: DemoServer): DemoNetwork {
  let requests: ReadonlyArray<DemoRequest> = [];
  let failures = 0;
  let nextId = 1;
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) {
      listener();
    }
  };
  const update = (id: number, change: Partial<DemoRequest>) => {
    requests = requests.map((request) =>
      request.id === id ? { ...request, ...change } : request,
    );
    notify();
  };

  const fetch: Fetch = async (input, init) => {
    const request =
      input instanceof Request
        ? new Request(input, init)
        : new Request(new URL(String(input), origin), init);
    const url = new URL(request.url);
    const id = nextId++;
    const body =
      request.method === 'GET' || request.method === 'HEAD'
        ? undefined
        : pretty(await request.clone().text());
    requests = [
      ...requests.slice(-49),
      {
        body,
        endedAt: undefined,
        id,
        method: request.method,
        outcome: 'pending',
        path: decodeURIComponent(url.pathname + url.search),
        response: undefined,
        startedAt: Date.now(),
        status: undefined,
      },
    ];
    notify();
    try {
      await wait(
        network.latency * (0.75 + Math.random() * 0.5),
        request.signal,
      );
    } catch (cause) {
      update(id, { endedAt: Date.now(), outcome: 'aborted' });
      throw cause;
    }
    if (failures > 0) {
      failures--;
      update(id, {
        endedAt: Date.now(),
        outcome: 'failed',
        response: 'The connection dropped (simulated).',
      });
      // What `fetch` rejects with when there's no network.
      throw new TypeError('Failed to fetch');
    }
    const response = await server.fetch(request);
    update(id, { status: response.status });
    void response
      .clone()
      .text()
      .then(
        (text) =>
          update(id, {
            endedAt: Date.now(),
            outcome: 'responded',
            response: pretty(text),
          }),
        () => update(id, { endedAt: Date.now(), outcome: 'aborted' }),
      );
    return response;
  };

  const network: DemoNetwork = {
    fetch,
    latency: latencies[1].ms,
    failNext(count = 1) {
      failures = count;
      notify();
    },
    get failures() {
      return failures;
    },
    get requests() {
      return requests;
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  return network;
}
