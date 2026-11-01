/** A request a demo's app sent, as the requests panel shows it. */
export interface DemoRequest {
  /** Pretty-printed when it's JSON. */
  readonly body: string | undefined;
  readonly endedAt: number | undefined;
  /** Which of the demo's browsers sent it, when it has several. */
  readonly from?: string | undefined;
  /** Its headers, a `name: value` line each: a reconnect's `last-event-id`. */
  readonly headers?: string | undefined;
  readonly id: number;
  readonly method: string;
  /** The path and query, decoded: `/trpc/profile.get`. */
  readonly path: string;
  /**
   * What came back, pretty-printed when it's JSON, or why nothing did. A
   * stream's (a subscription's events) grows as it arrives.
   */
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
  /** Subscriptions whose responses (SSE) are open. */
  readonly connections: number;
  /**
   * Cuts every open subscription's response, as a lost connection does:
   * the client sees its body fail, and the server sees it cancelled.
   */
  dropConnections(): void;
  /** `fetch`, with its requests logged as sent by `from`. */
  fetchAs(from: string): Fetch;
  /** The latest 50, oldest first. */
  readonly requests: ReadonlyArray<DemoRequest>;
  readonly subscribe: (listener: () => void) => () => void;
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

/** Whether a body of `type` is bytes to describe, not text to show. */
function isBinary(type: string | null) {
  return (
    type !== null &&
    type !== '' &&
    !/^text\/|json|xml|javascript|x-www-form-urlencoded/i.test(type)
  );
}

function sizeOf(bytes: number) {
  return bytes < 1024
    ? `${String(bytes)} B`
    : `${(bytes / 1024).toFixed(1)} kB`;
}

/** Bytes as the requests panel shows them: what, how many, how they start. */
function describeBytes(opts: {
  readonly head: Uint8Array;
  readonly name?: string | undefined;
  readonly size: number;
  readonly type: string;
}) {
  const hex = Array.from(opts.head, (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join(' ');
  return [
    `(${[opts.name, opts.type || 'no type', sizeOf(opts.size)].filter(Boolean).join(', ')})`,
    `${hex}${opts.size > opts.head.length ? ' …' : ''}`,
  ].join('\n');
}

/** How many bytes of a binary body the panel shows. */
const headBytes = 16;

async function describeBlob(blob: Blob) {
  return describeBytes({
    head: new Uint8Array(await blob.slice(0, headBytes).arrayBuffer()),
    name: blob instanceof File ? blob.name : undefined,
    size: blob.size,
    type: blob.type,
  });
}

/**
 * A request's body for the panel: JSON pretty-printed, a multipart body
 * (files in an input) a part each, and bytes described.
 */
async function requestBody(request: Request) {
  const type = request.headers.get('content-type');
  if (type?.startsWith('multipart/form-data')) {
    const parts = await Promise.all(
      Array.from(await request.formData(), async ([name, value]) =>
        typeof value === 'string'
          ? `--- ${name}\n${pretty(value)}`
          : `--- ${name}\n${await describeBlob(value)}`,
      ),
    );
    return parts.join('\n');
  }
  return isBinary(type)
    ? describeBlob(await request.blob())
    : pretty(await request.text());
}

/**
 * A response's body for the panel as it arrives: text as it decodes,
 * pretty-printed once whole, and bytes (a `File` output) described.
 */
function responseBody(headers: Headers) {
  const type = headers.get('content-type');
  if (!isBinary(type)) {
    const decoder = new TextDecoder();
    let text = '';
    return {
      add: (chunk: Uint8Array) =>
        (text += decoder.decode(chunk, { stream: true })),
      end: () => pretty((text += decoder.decode())),
      get shown() {
        return text;
      },
    };
  }
  // `content-disposition: attachment; filename="ada.png"`, for a file.
  const name = /filename="?([^";]+)/.exec(
    headers.get('content-disposition') ?? '',
  )?.[1];
  let head = new Uint8Array(0);
  let size = 0;
  const shown = () => describeBytes({ head, name, size, type: type ?? '' });
  return {
    add: (chunk: Uint8Array) => {
      if (head.length < headBytes) {
        head = new Uint8Array([
          ...head,
          ...chunk.subarray(0, headBytes - head.length),
        ]);
      }
      size += chunk.length;
      return shown();
    },
    end: shown,
    get shown() {
      return shown();
    },
  };
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
 * server's handler, and logs both sides for the requests panel, a
 * response's body as it arrives. `failNext()` makes the next request fail
 * like a dropped connection, and `dropConnections()` cuts the open
 * subscriptions.
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
  /** How to cut each subscription's response still arriving. */
  const open = new Set<() => void>();

  /**
   * `response` with a body that logs each chunk as the client reads it.
   * The client cancelling it cancels the server's, so a closed
   * subscription ends on the server too.
   */
  const relay = (id: number, response: Response) => {
    const source = response.body?.getReader();
    if (!source) {
      update(id, { endedAt: Date.now(), outcome: 'responded', response: '' });
      return response;
    }
    const log = responseBody(response.headers);
    let ended = false;
    const end = (change: Partial<DemoRequest>) => {
      if (!ended) {
        ended = true;
        open.delete(drop);
        update(id, { endedAt: Date.now(), ...change });
      }
    };
    let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
    const drop = () => {
      end({
        outcome: 'failed',
        response: `${log.shown}\n(The connection dropped, simulated.)`,
      });
      // What a fetch body fails with when the connection drops.
      controller?.error(new TypeError('network error'));
      source.cancel().catch(() => undefined);
    };
    if (response.headers.get('content-type')?.startsWith('text/event-stream')) {
      open.add(drop);
      notify();
    }
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        controller = c;
      },
      async pull(c) {
        try {
          const chunk = await source.read();
          if (ended) {
            return;
          }
          if (chunk.done) {
            end({ outcome: 'responded', response: log.end() });
            c.close();
            return;
          }
          update(id, { response: log.add(chunk.value) });
          c.enqueue(chunk.value);
        } catch (cause) {
          end({ outcome: 'aborted' });
          c.error(cause);
        }
      },
      cancel(reason) {
        end({ outcome: 'aborted' });
        return source.cancel(reason);
      },
    });
    return new Response(body, {
      headers: response.headers,
      status: response.status,
      statusText: response.statusText,
    });
  };

  const send = async (
    from: string | undefined,
    input: RequestInfo | URL,
    init: RequestInit | undefined,
  ) => {
    const request =
      input instanceof Request
        ? new Request(input, init)
        : new Request(new URL(String(input), origin), init);
    const url = new URL(request.url);
    const id = nextId++;
    const body =
      request.method === 'GET' || request.method === 'HEAD'
        ? undefined
        : await requestBody(request.clone());
    requests = [
      ...requests.slice(-49),
      {
        body,
        endedAt: undefined,
        from,
        headers: Array.from(
          request.headers,
          ([name, value]) => `${name}: ${value}`,
        ).join('\n'),
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
    return relay(id, response);
  };

  const network: DemoNetwork = {
    fetch: (input, init) => send(undefined, input, init),
    fetchAs: (from) => (input, init) => send(from, input, init),
    latency: latencies[1].ms,
    failNext(count = 1) {
      failures = count;
      notify();
    },
    get failures() {
      return failures;
    },
    get connections() {
      return open.size;
    },
    dropConnections() {
      for (const drop of open) {
        drop();
      }
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
