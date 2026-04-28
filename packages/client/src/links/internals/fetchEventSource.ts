import { getFetch } from '../../getFetch';
import type {
  FetchEsque,
  NodeJSReadableStreamEsque,
  WebReadableStreamEsque,
} from '../../internals/types';
import type { HTTPHeaders } from '../types';

type Listener = (event: any) => void;

type ListenerEntry = {
  listener: Listener;
  once: boolean;
};

export interface FetchEventSourceInit extends EventSourceInit {
  fetch?: FetchEsque;
  headers?: HTTPHeaders;
  credentials?: RequestCredentials;
  retry?: number;
}

type SSEMessage = {
  data: string;
  event: string;
  id?: string;
};

function createMessageEvent(message: SSEMessage) {
  return {
    data: message.data,
    lastEventId: message.id,
    type: message.event,
  };
}

function createErrorEvent(error: unknown) {
  return {
    error,
    message: error instanceof Error ? error.message : 'Unknown error',
    type: 'error',
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeHeaders(headers?: HTTPHeaders): Record<string, string> {
  if (!headers) {
    return {};
  }
  if (Symbol.iterator in headers) {
    return Object.fromEntries(headers);
  }

  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      normalized[key] = value.join(', ');
    } else if (value !== undefined) {
      normalized[key] = value;
    }
  }

  return normalized;
}

function nodeJsStreamToReaderEsque(source: NodeJSReadableStreamEsque) {
  return {
    getReader() {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          source.on('data', (chunk) => {
            controller.enqueue(chunk);
          });
          source.on('end', () => {
            controller.close();
          });
          source.on('error', (error) => {
            controller.error(error);
          });
        },
      });

      return stream.getReader();
    },
  };
}

async function readSSEStream(opts: {
  body: NodeJSReadableStreamEsque | WebReadableStreamEsque;
  onMessage: (message: SSEMessage) => void;
  onRetry: (retryMs: number) => void;
  signal: AbortSignal;
}) {
  const reader =
    'getReader' in opts.body
      ? opts.body.getReader()
      : nodeJsStreamToReaderEsque(opts.body).getReader();
  const decoder = new TextDecoder();

  let buffer = '';
  let currentEvent = 'message';
  let currentData = '';
  let currentId: string | undefined = undefined;

  const emit = () => {
    if (currentData === '' && !currentId && currentEvent === 'message') {
      return;
    }
    const data = currentData.endsWith('\n')
      ? currentData.slice(0, -1)
      : currentData;
    opts.onMessage({
      data,
      event: currentEvent,
      id: currentId,
    });
    currentEvent = 'message';
    currentData = '';
    currentId = undefined;
  };

  const parseLine = (line: string) => {
    if (line === '') {
      emit();
      return;
    }
    if (line.startsWith(':')) {
      return;
    }

    const separator = line.indexOf(':');
    const field = separator === -1 ? line : line.slice(0, separator);
    const rawValue = separator === -1 ? '' : line.slice(separator + 1);
    const value = rawValue.startsWith(' ') ? rawValue.slice(1) : rawValue;

    switch (field) {
      case 'event':
        currentEvent = value || 'message';
        break;
      case 'data':
        currentData += `${value}\n`;
        break;
      case 'id':
        currentId = value;
        break;
      case 'retry': {
        const retryMs = Number.parseInt(value, 10);
        if (Number.isFinite(retryMs) && retryMs >= 0) {
          opts.onRetry(retryMs);
        }
        break;
      }
    }
  };

  while (!opts.signal.aborted) {
    const { done, value } = await reader.read();
    if (done) {
      buffer += decoder.decode();
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      parseLine(line);
    }
  }

  if (buffer) {
    const trailingLines = buffer.split(/\r?\n/);
    for (const line of trailingLines) {
      parseLine(line);
    }
  }

  emit();
}

export class FetchEventSource {
  public readonly CONNECTING = 0;
  public readonly OPEN = 1;
  public readonly CLOSED = 2;

  public readyState = this.CONNECTING;
  public readonly withCredentials: boolean;
  public onmessage: Listener | null = null;
  public onerror: Listener | null = null;
  public onopen: Listener | null = null;

  private readonly listeners = new Map<string, Set<ListenerEntry>>();
  private readonly controller = new AbortController();
  private closed = false;
  private retryDelayMs: number;

  constructor(
    public readonly url: string,
    private readonly init: FetchEventSourceInit = {},
  ) {
    this.withCredentials = init.withCredentials ?? false;
    this.retryDelayMs = init.retry ?? 1_000;
    void this.start();
  }

  public addEventListener(
    type: string,
    listener: Listener,
    options?: boolean | AddEventListenerOptions,
  ) {
    const once = typeof options === 'object' && options?.once === true;
    const listeners = this.listeners.get(type) ?? new Set<ListenerEntry>();
    listeners.add({ listener, once });
    this.listeners.set(type, listeners);
  }

  public removeEventListener(type: string, listener: Listener) {
    const listeners = this.listeners.get(type);
    if (!listeners) {
      return;
    }

    for (const entry of listeners) {
      if (entry.listener === listener) {
        listeners.delete(entry);
      }
    }

    if (listeners.size === 0) {
      this.listeners.delete(type);
    }
  }

  public close = () => {
    this.closed = true;
    this.readyState = this.CLOSED;
    this.controller.abort();
  };

  private dispatch(type: string, event: any) {
    if (type === 'message') {
      this.onmessage?.(event);
    } else if (type === 'error') {
      this.onerror?.(event);
    } else if (type === 'open') {
      this.onopen?.(event);
    }

    const listeners = this.listeners.get(type);
    if (!listeners) {
      return;
    }

    for (const entry of Array.from(listeners)) {
      entry.listener(event);
      if (entry.once) {
        listeners.delete(entry);
      }
    }

    if (listeners.size === 0) {
      this.listeners.delete(type);
    }
  }

  private async start() {
    const fetch = getFetch(this.init.fetch);

    while (!this.closed) {
      this.readyState = this.CONNECTING;

      try {
        const response = await fetch(this.url, {
          method: 'GET',
          headers: normalizeHeaders(this.init.headers),
          credentials: this.init.credentials,
          signal: this.controller.signal,
        });

        if (!response.ok || !response.body) {
          throw new Error(`SSE request failed with status ${response.status}`);
        }

        this.readyState = this.OPEN;
        this.dispatch('open', { type: 'open' });

        let shouldReconnect = true;

        await readSSEStream({
          body: response.body,
          onRetry: (retryMs) => {
            this.retryDelayMs = retryMs;
          },
          signal: this.controller.signal,
          onMessage: (message) => {
            switch (message.event) {
              case 'return':
                shouldReconnect = false;
                this.close();
                return;
              case 'connected':
              case 'serialized-error':
              case 'ping':
                this.dispatch(message.event, createMessageEvent(message));
                return;
              default:
                this.dispatch('message', createMessageEvent(message));
            }
          },
        });

        if (!shouldReconnect || this.closed) {
          return;
        }

        this.readyState = this.CONNECTING;
        this.dispatch(
          'error',
          createErrorEvent(new Error('SSE connection closed unexpectedly')),
        );
      } catch (cause) {
        if (this.controller.signal.aborted || this.closed) {
          return;
        }

        this.readyState = this.CONNECTING;
        this.dispatch('error', createErrorEvent(cause));
      }

      if (this.closed) {
        return;
      }

      await sleep(this.retryDelayMs);
    }
  }
}
