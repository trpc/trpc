import { EventEmitter } from 'events';
import type * as http from 'http';
import { expect, test, vi } from 'vitest';
import { incomingMessageToRequest } from './incomingMessageToRequest';
import { writeResponseBody } from './writeResponse';

function createMockRes() {
  const res = new EventEmitter() as http.ServerResponse;
  const writing = new Promise<void>((resolve) => {
    res.write = vi.fn(() => {
      resolve();
      return false;
    });
  });
  return { res, writing };
}

test.each(['close', 'aborted then close'])(
  'cancels a backpressured response body after %s',
  async (event) => {
    const { res, writing } = createMockRes();
    const req = Object.assign(new EventEmitter(), {
      headers: {},
      url: '/test',
      method: 'GET',
      socket: new EventEmitter(),
    }) as http.IncomingMessage;
    const request = incomingMessageToRequest(req, res, { maxBodySize: null });
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array<ArrayBuffer>>({
      start(controller) {
        controller.enqueue(new Uint8Array([1]));
      },
      cancel,
    });
    const promise = writeResponseBody({ res, signal: request.signal, body });

    try {
      await writing;
      if (event === 'aborted then close') {
        req.emit('aborted');
        expect(request.signal.aborted).toBe(true);
      }
      res.emit('close');
      expect(request.signal.aborted).toBe(true);
      await vi.waitFor(() => expect(cancel).toHaveBeenCalledOnce());
      await promise;
      expect(res.listenerCount('drain')).toBe(0);
      expect(res.listenerCount('error')).toBe(0);
      expect(res.listenerCount('close')).toBe(0);
    } finally {
      res.emit('drain');
      await promise;
    }
  },
);

test.each(['drain', 'error'] as const)(
  'cleans up backpressure listeners after %s',
  async (event) => {
    const { res, writing } = createMockRes();
    const body = new ReadableStream<Uint8Array<ArrayBuffer>>({
      start(controller) {
        controller.enqueue(new Uint8Array([1]));
        controller.close();
      },
    });
    const promise = writeResponseBody({
      res,
      signal: new AbortController().signal,
      body,
    });
    const error = new Error('write failed');
    const assertion =
      event === 'error'
        ? expect(promise).rejects.toBe(error)
        : expect(promise).resolves.toBeUndefined();

    await writing;
    res.emit(event, error);
    await assertion;
    expect(res.listenerCount('drain')).toBe(0);
    expect(res.listenerCount('error')).toBe(0);
    expect(res.listenerCount('close')).toBe(0);
  },
);
