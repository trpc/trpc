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
 * Parses a `text/event-stream` fed to it in decoded chunks, following the
 * WHATWG rules for lines, fields and dispatch.
 * @see https://html.spec.whatwg.org/multipage/server-sent-events.html#event-stream-interpretation
 */
export function createSSEParser(onMessage: (message: SSEMessage) => void) {
  let buffer = '';
  // a `\r` at the end of a chunk may be the first half of `\r\n`
  let skipLeadingLF = false;
  let event = '';
  let data = '';
  let hasData = false;
  let id: string | undefined = undefined;

  const dispatch = () => {
    const message: SSEMessage | null = hasData
      ? { event: event || 'message', data, id }
      : null;
    event = '';
    data = '';
    hasData = false;
    id = undefined;
    if (message) {
      onMessage(message);
    }
  };

  const processLine = (line: string) => {
    if (line === '') {
      dispatch();
      return;
    }
    if (line.startsWith(':')) {
      return;
    }
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) {
      value = value.slice(1);
    }
    switch (field) {
      case 'event':
        event = value;
        break;
      case 'data':
        data = hasData ? data + '\n' + value : value;
        hasData = true;
        break;
      case 'id':
        if (!value.includes('\0')) {
          id = value;
        }
        break;
      // `retry` and unknown fields are ignored
    }
  };

  return {
    push(chunk: string) {
      buffer += chunk;
      if (skipLeadingLF && buffer.startsWith('\n')) {
        buffer = buffer.slice(1);
      }
      skipLeadingLF = false;

      let start = 0;
      for (let i = 0; i < buffer.length; i++) {
        const char = buffer[i];
        if (char !== '\n' && char !== '\r') {
          continue;
        }
        processLine(buffer.slice(start, i));
        if (char === '\r') {
          if (i + 1 === buffer.length) {
            skipLeadingLF = true;
          } else if (buffer[i + 1] === '\n') {
            i++;
          }
        }
        start = i + 1;
      }
      buffer = buffer.slice(start);
    },
  };
}
