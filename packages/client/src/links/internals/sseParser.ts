import { makeResource } from '@trpc/server/unstable-core-do-not-import';
import { throwIfAborted } from '../../internals/signals';
import type { WebReadableStreamEsque } from '../../internals/types';

/**
 * One event of a `text/event-stream`.
 */
export interface SSEMessage {
  /** The `event` field, or `'message'` when there is none. */
  event: string;
  /** The `data` fields, joined by `\n`. */
  data: string;
  /**
   * The event's own `id` field, or `undefined` when it has none. Unlike
   * `EventSource`, an event without one doesn't inherit the last id.
   */
  id: string | undefined;
}

/**
 * The body's bytes as text. Ending the iteration, or aborting `signal`,
 * cancels the body; an aborted `signal` throws.
 */
async function* textChunks(body: WebReadableStreamEsque, signal: AbortSignal) {
  const reader = body.getReader();
  const cancel = () => {
    reader.cancel().catch(() => {
      // the stream is already errored or closed
    });
  };
  // a `fetch` that ignores its signal still stops reading
  signal.addEventListener('abort', cancel, { once: true });
  using _reader = makeResource({}, () => {
    signal.removeEventListener('abort', cancel);
    cancel();
  });

  const decoder = new TextDecoder();
  while (true) {
    const chunk = await reader.read();
    throwIfAborted(signal);
    if (chunk.done) {
      return;
    }
    yield decoder.decode(chunk.value, { stream: true });
  }
}

/**
 * Lines split on `\r\n`, `\r` or `\n`. A `\r` at the end of a chunk waits
 * for the next one, which may start with its `\n`.
 */
async function* lines(chunks: AsyncIterable<string>) {
  let buffer = '';
  for await (const chunk of chunks) {
    buffer += chunk;
    const parts = buffer.split(/\r\n|\r(?!$)|\n/);
    buffer = parts.pop() ?? '';
    yield* parts;
  }
}

/**
 * The events of a `text/event-stream`, following the WHATWG rules for
 * fields and dispatch. An event without a blank line after it, at the end
 * of the stream, isn't dispatched.
 * @see https://html.spec.whatwg.org/multipage/server-sent-events.html#event-stream-interpretation
 */
export async function* parseSSE(
  chunks: AsyncIterable<string>,
): AsyncGenerator<SSEMessage> {
  let event = '';
  let data: string | null = null;
  let id: string | undefined = undefined;

  for await (const line of lines(chunks)) {
    if (line === '') {
      if (data !== null) {
        yield { event: event || 'message', data, id };
      }
      event = '';
      data = null;
      id = undefined;
      continue;
    }
    if (line.startsWith(':')) {
      continue;
    }
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    const value = colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '');
    switch (field) {
      case 'event':
        event = value;
        break;
      case 'data':
        data = data === null ? value : `${data}\n${value}`;
        break;
      case 'id':
        if (!value.includes('\0')) {
          id = value;
        }
        break;
      // `retry` and unknown fields are ignored
    }
  }
}

/**
 * The events of an SSE response body.
 */
export function sseMessages(body: WebReadableStreamEsque, signal: AbortSignal) {
  return parseSSE(textChunks(body, signal));
}
