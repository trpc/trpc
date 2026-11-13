/**
 * What the blog pages need to show pipelining at work: a switch for it, a
 * slow network, and a log of the requests a page made. None of it is needed
 * to use pipelining.
 */
import { useSyncExternalStore } from 'react';

/** Added to every request for the blog, so a round trip is easy to see */
export const NETWORK_LATENCY_MS = 400;

function createStore<TValue>(initial: TValue) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (next: TValue) => {
      value = next;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const STORAGE_KEY = 'blog-demo:pipelining';

function readPipelining() {
  if (typeof window === 'undefined') {
    return true;
  }
  return window.localStorage.getItem(STORAGE_KEY) !== 'off';
}

const pipelining = createStore(readPipelining());

export function isPipeliningOn() {
  return pipelining.get();
}

export function setPipelining(on: boolean) {
  window.localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
  pipelining.set(on);
}

export function usePipelining() {
  return useSyncExternalStore(pipelining.subscribe, pipelining.get, () => true);
}

export interface LoggedRequest {
  id: number;
  /** The procedures the request called */
  procedures: string[];
  /** Whether the server filled in an input from another call's data */
  pipelined: boolean;
  /** Milliseconds since the page's loader started */
  startedAt: number;
  endedAt: number | null;
}

const noRequests: LoggedRequest[] = [];
const requestLog = createStore(noRequests);
let loadStartedAt = 0;
let nextId = 0;

/** Call it when a blog page's loader starts: the log then shows that page's requests */
export function startRequestLog() {
  if (typeof window === 'undefined') {
    return;
  }
  loadStartedAt = performance.now();
  requestLog.set(noRequests);
}

export function useRequestLog() {
  return useSyncExternalStore(
    requestLog.subscribe,
    requestLog.get,
    () => noRequests,
  );
}

/** A `fetch` for the tRPC link that slows down and logs the blog's requests */
export const blogDemoFetch: typeof fetch = async (input, init) => {
  const url = new URL(
    input instanceof Request ? input.url : input,
    window.location.origin,
  );
  const procedures = decodeURIComponent(
    url.pathname.split('/api/trpc/')[1] ?? '',
  ).split(',');
  if (!procedures.some((procedure) => procedure.startsWith('blog.'))) {
    return fetch(input, init);
  }

  const id = nextId++;
  requestLog.set([
    ...requestLog.get(),
    {
      id,
      procedures,
      // A POST says in its body which inputs the server fills in
      pipelined:
        typeof init?.body === 'string' && init.body.includes('"pipe":'),
      startedAt: performance.now() - loadStartedAt,
      endedAt: null,
    },
  ]);
  const end = () => {
    const endedAt = performance.now() - loadStartedAt;
    requestLog.set(
      requestLog
        .get()
        .map((request) =>
          request.id === id ? { ...request, endedAt } : request,
        ),
    );
  };

  try {
    await new Promise((resolve) => setTimeout(resolve, NETWORK_LATENCY_MS));
    const res = await fetch(input, init);
    // The response is streamed, so it ends when its body does
    void res
      .clone()
      .arrayBuffer()
      .catch(() => undefined)
      .then(end);
    return res;
  } catch (cause) {
    end();
    throw cause;
  }
};
