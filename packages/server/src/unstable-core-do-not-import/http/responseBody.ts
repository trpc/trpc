import type { TRPCError } from '../error/TRPCError';
import { makeResource } from '../stream/utils/disposable';
import { abortSignalsAnyPonyfill } from '../utils';
import { attempt } from './outcome';

/**
 * The lifetime of a request's procedure calls. A client that leaves may only
 * cancel the response body, without aborting the request's signal, and the
 * procedures streaming into the body wait on either.
 */
export interface RequestLifetime {
  /** Aborts when the request is aborted or the response body is cancelled */
  signal: AbortSignal;
  /** Aborts when the response body is cancelled */
  bodyCancelled: AbortSignal;
  cancelBody: () => void;
}

export function requestLifetime(req: Request): RequestLifetime {
  const bodyCancelled = new AbortController();
  return {
    signal: abortSignalsAnyPonyfill([req.signal, bodyCancelled.signal]),
    bodyCancelled: bodyCancelled.signal,
    cancelBody: () => bodyCancelled.abort(),
  };
}

/**
 * Calls `listener` once `signal` aborts, or right away if it already has,
 * until disposed.
 */
function abortListener(signal: AbortSignal, listener: () => void): Disposable {
  if (signal.aborted) {
    listener();
  } else {
    signal.addEventListener('abort', listener, { once: true });
  }
  return makeResource({}, () => {
    signal.removeEventListener('abort', listener);
  });
}

/**
 * Calls `onTimeout` after `ms`, unless disposed first. No timer runs when
 * `ms` is unset.
 */
function timeout(ms: number | undefined, onTimeout: () => void): Disposable {
  const timer = ms ? setTimeout(onTimeout, ms) : undefined;
  return makeResource({}, () => {
    clearTimeout(timer);
  });
}

/**
 * Reads `stream` until it ends or `signal` aborts. A pending read only
 * settles once the reader is cancelled, so the abort cancels it.
 */
async function* readUntilAborted(
  stream: ReadableStream<Uint8Array>,
  signal: AbortSignal,
): AsyncGenerator<Uint8Array, void> {
  const reader = stream.getReader();
  using _abort = abortListener(signal, () => void reader.cancel());

  while (true) {
    const chunk = await reader.read();
    if (chunk.done) {
      return;
    }
    yield chunk.value;
  }
}

/** Told how a response body ended */
export interface BodyListener {
  /** It ended, or the client cancelled it */
  ended: () => void;
  /** It failed after its headers were sent, and was ended */
  failed: (error: TRPCError) => void;
}

/**
 * A response body that streams `chunks`. It never errors: its headers are
 * already sent, so a failure is handed to `listener` and the body ends.
 * Cancelling it cancels `lifetime`'s body before stopping the generator,
 * which may be waiting on a read that only the cancellation settles.
 */
function bodyFrom(
  chunks: AsyncGenerator<Uint8Array, void>,
  opts: { lifetime: RequestLifetime; listener: BodyListener },
): ReadableStream<Uint8Array> {
  return new ReadableStream({
    async pull(controller) {
      const chunk = await attempt(() => chunks.next());
      if (!chunk.ok) {
        controller.close();
        opts.listener.failed(chunk.error);
      } else if (chunk.value.done) {
        controller.close();
        opts.listener.ended();
      } else {
        controller.enqueue(chunk.value.value);
      }
    },
    async cancel() {
      opts.lifetime.cancelBody();
      await chunks.return();
      opts.listener.ended();
    },
  });
}

/**
 * A body that ends with the stream, or as soon as the
 * client cancels it.
 */
export function streamBody(
  stream: ReadableStream<Uint8Array>,
  opts: { lifetime: RequestLifetime; listener: BodyListener },
): ReadableStream<Uint8Array> {
  return bodyFrom(readUntilAborted(stream, opts.lifetime.bodyCancelled), opts);
}

/**
 * The body of a subscription: it ends with the stream, when the call is
 * aborted, or once `maxDurationMs` passes, which aborts the call.
 * @see https://github.com/trpc/trpc/issues/7094
 */
export function subscriptionBody(
  stream: ReadableStream<Uint8Array>,
  opts: {
    lifetime: RequestLifetime;
    listener: BodyListener;
    call: { signal: AbortSignal; abort: () => void };
    maxDurationMs: number | undefined;
  },
): ReadableStream<Uint8Array> {
  async function* chunks() {
    using _maxDuration = timeout(opts.maxDurationMs, opts.call.abort);
    yield* readUntilAborted(stream, opts.call.signal);
  }
  return bodyFrom(chunks(), opts);
}
