/**
 * The showcase's tRPC setup: a plain `@trpc/client` with `retryLink`. One
 * load asks for a post, its author and the author's team, and a commenter
 * with an avatar for each comment, all in one pipelined POST. The queries
 * fail on purpose as the page's controls say, and the log below records each
 * attempt and each request, so you can see what a retry sends again.
 */
import {
  createTRPCClient,
  experimental_dataOf,
  experimental_load,
  experimental_perItem,
  experimental_pipelining,
  experimental_query,
  httpBatchLink,
  httpBatchStreamLink,
  loggerLink,
  retryLink,
} from '@trpc/client';
import type { TRPCLink } from '@trpc/client';
import { observable } from '@trpc/server/observable';

import type { AppRouter } from './-server/router.ts';

export const endpoint = '/kitchen-sink/retries/api';

/** How often each query fails, and how `retryLink` retries */
export interface Plan {
  readonly author: number;
  readonly avatar: number;
  /** One commenter's query fails, by the commenter's id */
  readonly commenter: { readonly id: string; readonly times: number } | null;
  readonly post: number;
  /** `null`: no `retryLink`, so a failure is final */
  readonly retry: {
    /** The most attempts of a query, the first one included */
    readonly attempts: number;
    readonly delayMs: number;
  } | null;
  readonly team: number;
  /**
   * Whether responses stream, with `httpBatchStreamLink`: each query shows
   * as soon as it has its data. Chrome's Network tab shows no body for a
   * streamed response; `httpBatchLink` sends one JSON body it can show
   */
  readonly stream: boolean;
}

/** The `fetch` a client sends its requests with */
export type Fetch = (
  url: RequestInfo | URL,
  init: RequestInit,
) => Promise<Response>;

/** An attempt of an operation, as a link after `retryLink` sees it */
export interface Attempt {
  /** The operation's id: a retry sends the same operation again */
  readonly id: number;
  readonly path: string;
  /** What it is for, from its input: an id, or what the server fills in */
  readonly label: string;
  /** Its attempts so far, this one included, as this link counts them */
  readonly attempt: number;
  /** Since the load started */
  readonly ms: number;
  readonly outcome: 'error' | 'ok' | 'pending';
  readonly error: string | null;
}

/** A call in a request, as the request's URL and body have it */
export interface SentCall {
  readonly path: string;
  readonly label: string;
}

/** A request the client sent */
export interface SentRequest {
  readonly calls: ReadonlyArray<SentCall>;
  /** Since the load started */
  readonly ms: number;
  /** When its response ended; `null` while it streams */
  readonly doneMs: number | null;
}

export interface LogState {
  readonly attempts: ReadonlyArray<Attempt>;
  readonly requests: ReadonlyArray<SentRequest>;
}

/**
 * What a load sends, as it goes: each attempt of each query, and each
 * request. It isn't needed to use `retryLink`; it's only for the page.
 */
export function createLog() {
  const startedAt = performance.now();
  let state: LogState = { attempts: [], requests: [] };
  const listeners = new Set<() => void>();
  const since = () => Math.round(performance.now() - startedAt);
  const set = (next: LogState) => {
    state = next;
    for (const listener of listeners) {
      listener();
    }
  };
  const counts = new Map<number, number>();
  return {
    get: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    /** Records an attempt, and returns what settles it */
    attempt(op: {
      readonly id: number;
      readonly path: string;
      readonly input: unknown;
    }) {
      const attempt = (counts.get(op.id) ?? 0) + 1;
      counts.set(op.id, attempt);
      const index = state.attempts.length;
      set({
        ...state,
        attempts: [
          ...state.attempts,
          {
            attempt,
            error: null,
            id: op.id,
            label: labelOf(op.input, false),
            ms: since(),
            outcome: 'pending',
            path: op.path,
          },
        ],
      });
      return (outcome: 'error' | 'ok', error: string | null) => {
        set({
          ...state,
          attempts: state.attempts.map((it, at) =>
            at === index ? { ...it, error, outcome } : it,
          ),
        });
      };
    },
    /** Records a request, and returns what ends it */
    request(calls: ReadonlyArray<SentCall>) {
      const index = state.requests.length;
      set({
        ...state,
        requests: [...state.requests, { calls, doneMs: null, ms: since() }],
      });
      return () => {
        set({
          ...state,
          requests: state.requests.map((it, at) =>
            at === index ? { ...it, doneMs: since() } : it,
          ),
        });
      };
    },
  };
}

export type Log = ReturnType<typeof createLog>;

/** What a query is for, from its input */
function labelOf(input: unknown, filled: boolean) {
  const record =
    typeof input === 'object' && input !== null
      ? (input as Record<string, unknown>)
      : {};
  const id = record['slug'] ?? record['id'];
  if (typeof id === 'string') {
    return id;
  }
  return filled ? 'read by the server' : 'waits for what it reads';
}

/** The calls of a request, from its URL and its body */
function callsOf(url: string, init: { readonly body?: unknown }): SentCall[] {
  const path = new URL(url, 'http://localhost').pathname.slice(
    endpoint.length + 1,
  );
  let body: Record<string, unknown> = {};
  try {
    body =
      typeof init.body === 'string'
        ? (JSON.parse(init.body) as Record<string, unknown>)
        : {};
  } catch {
    // A body the page can't read: the calls keep their paths only
  }
  const pipe = (body['pipe'] ?? {}) as Record<string, unknown>;
  return path.split(',').map((call, index) => ({
    label: labelOf(body[index], String(index) in pipe),
    path: call,
  }));
}

/** Logs every attempt that goes past it, and how it ended */
function attemptsLink(log: Log): TRPCLink<AppRouter> {
  return () =>
    ({ next, op }) =>
      observable((observer) => {
        const settle = log.attempt(op);
        return next(op).subscribe({
          complete() {
            settle('ok', null);
            observer.complete();
          },
          error(error) {
            settle('error', error.message);
            observer.error(error);
          },
          next(value) {
            observer.next(value);
          },
        });
      });
}

/**
 * The post, its author and the author's team, and a commenter with an avatar
 * for each comment: one pipelined request, then a retry for what failed
 */
export function loadRetries(opts: {
  readonly fetch: Fetch;
  readonly log: Log;
  readonly plan: Plan;
  /** A new one for each load: the server counts each query's runs by it */
  readonly session: string;
  readonly signal: AbortSignal;
}) {
  const { plan, session } = opts;
  const client = createTRPCClient<AppRouter>({
    links: [
      // Retries a query that failed by itself. The queries that read it go
      // in its retry's request; what it read isn't sent again
      ...(plan.retry
        ? [
            retryLink<AppRouter>({
              retry: (retryOpts) =>
                retryOpts.attempts < (plan.retry?.attempts ?? 1),
              retryDelayMs: () => plan.retry?.delayMs ?? 0,
            }),
          ]
        : []),
      // The standard logger, after `retryLink`: the browser's console has
      // each attempt of each query, and its result
      loggerLink(),
      // Only for the page's log: it sees each attempt of each query
      attemptsLink(opts.log),
      (plan.stream ? httpBatchStreamLink : httpBatchLink)({
        experimental_pipelining: experimental_pipelining(),
        fetch: async (url, init) => {
          const end = opts.log.request(
            callsOf(url instanceof Request ? url.url : String(url), init ?? {}),
          );
          const response = await opts.fetch(url, {
            ...init,
            signal: init?.signal ?? null,
          });
          // The request ends when its streamed body does
          if (response.body) {
            const [forPage, forLog] = response.body.tee();
            void forLog.pipeTo(new WritableStream()).then(end, end);
            return new Response(forPage, response);
          }
          end();
          return response;
        },
        methodOverride: 'POST',
        url: endpoint,
      }),
    ],
  });
  // What to load: plain values, so nothing is sent yet
  const post = experimental_query(client.post.bySlug, {
    failTimes: plan.post,
    session,
    slug: 'retries',
  });
  const author = experimental_query(client.author.byId, {
    failTimes: plan.author,
    id: experimental_dataOf(post).authorId,
    session,
  });
  return experimental_load(
    client,
    {
      author,
      comments: experimental_perItem(
        experimental_dataOf(post).comments,
        (comment) => {
          const commenter = experimental_query(client.user.byId, {
            failFor: plan.commenter?.id ?? null,
            failTimes: plan.commenter?.times ?? 0,
            id: comment.by,
            session,
          });
          return {
            avatar: experimental_query(client.avatar.byId, {
              failTimes: plan.avatar,
              id: experimental_dataOf(commenter).avatarId,
              session,
            }),
            commenter,
          };
        },
      ),
      post,
      team: experimental_query(client.team.byId, {
        failTimes: plan.team,
        id: experimental_dataOf(author).teamId,
        session,
      }),
    },
    { signal: opts.signal },
  );
}

export type Loaded = ReturnType<typeof loadRetries>;
