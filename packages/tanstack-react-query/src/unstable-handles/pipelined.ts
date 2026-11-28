import type { QueryFunctionContext } from '@tanstack/react-query';
import { skipToken } from '@tanstack/react-query';
import {
  experimental_isPipelineFallback,
  TRPCUntypedClient,
} from '@trpc/client';
import type { OperationPipeline } from '@trpc/client/unstable-internals';
import {
  createOperationPipeline,
  isPipelineTaken,
  pipelineContext,
  readPipelinedRun,
  readsContext,
} from '@trpc/client/unstable-internals';
import type { PipelineCallReads } from '@trpc/server/unstable-core-do-not-import';
import { isAsyncIterable } from '@trpc/server/unstable-core-do-not-import';
import { streamIntoQuery } from '../internals/utils';
import type { EntryQueryOptions } from './entry';
import type { Outcome } from './outcome';
import { attempt } from './outcome';
import { isPlainObject } from './utils';

/**
 * Whether two inputs, query keys or cursors are the same request. Only what
 * can be shown to be: equal primitives, of the same type, and plain objects
 * and arrays of them. A date is the same only as a date of the same time.
 * Anything else, such as a class instance a transformer keeps, is not, so
 * the query is fetched by itself rather than recorded with another's
 * result. Not their cache hash, which is JSON: no value isn't `null`, no
 * key isn't a key whose value is `undefined`, a hole in an array isn't a
 * value, and `-0` isn't `0`.
 */
export function sameValue(a: unknown, b: unknown): boolean {
  // `NaN` is the same value as `NaN`. `-0` is not `0`: a transformer that
  // keeps it, such as superjson, lets a resolver tell them apart
  if (Object.is(a, b)) {
    return true;
  }
  if (a instanceof Date || b instanceof Date) {
    return (
      a instanceof Date && b instanceof Date && a.getTime() === b.getTime()
    );
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      // Every index, also a hole: `every()` skips one, and a hole is not the
      // value at that index, as a missing key isn't
      Array.from(
        { length: a.length },
        (_, index) =>
          index in a === index in b && sameValue(a[index], b[index]),
      ).every(Boolean)
    );
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    // A key whose value is `undefined` is not a missing key: a transformer
    // that keeps it, such as superjson, lets a resolver tell them apart
    const keys = Object.keys(a);
    return (
      keys.length === Object.keys(b).length &&
      keys.every(
        (key) =>
          Object.prototype.hasOwnProperty.call(b, key) &&
          sameValue(a[key], b[key]),
      )
    );
  }
  return false;
}

/**
 * What a call that the server made in another's request settled to, for the
 * query that would make the same request:
 * - `data`: the query's data.
 * - `error`: it ran and failed. That is the query's error.
 * - `notRun`: it didn't run, such as when its request failed as a whole or
 *   the server refused it. The query makes its request itself.
 */
export type PipelinedOutcome =
  | { readonly kind: 'data'; readonly data: unknown }
  | { readonly kind: 'error'; readonly error: unknown }
  | { readonly kind: 'notRun' };

/** A call that didn't run, for the query to make its request itself */
export const notRun: PipelinedOutcome = { kind: 'notRun' };

/**
 * What the operation of a query that runs once ended with: its data, or its
 * own error. It didn't run if what it reads failed: the query, which can't
 * start then, would make its request itself. Never rejects
 */
export function outcomeOfSend(send: ReadingSend): Promise<PipelinedOutcome> {
  return send.settled.then((settled): PipelinedOutcome =>
    settled.ok
      ? { kind: 'data', data: settled.data }
      : experimental_isPipelineFallback(settled.error)
        ? notRun
        : { kind: 'error', error: settled.error },
  );
}

/**
 * One item's outcome of the operation of a query for every item, at
 * `indexes`: `null` for an item the server ran no call for. Each item has
 * its own. An operation that failed as a whole ran for none of them, so none
 * has its error, and one that couldn't go in the request of its list ran for
 * none either. A run's error, also one the link couldn't read, is a
 * `TRPCClientError` already, and is the item's as it is. Never rejects
 */
export function outcomeOfItem(
  send: ReadingSend,
  indexes: number[] | null,
): Promise<PipelinedOutcome> {
  return send.settled.then(async (settled): Promise<PipelinedOutcome> => {
    if (!indexes || !settled.ok) {
      return notRun;
    }
    // Its runs, as the link that pipelines gave them, which the promise of
    // the operation's result awaited the first level of. Or what that link
    // gives for runs it couldn't put in a request, which has no run of any
    // item
    const item = await readPipelinedRun(
      Promise.resolve(settled.data) as Parameters<typeof readPipelinedRun>[0],
      indexes,
    );
    switch (item.kind) {
      case 'data':
        return { kind: 'data', data: item.data };
      case 'error':
        return { kind: 'error', error: item.error };
      case 'missing':
        return notRun;
    }
  });
}

/**
 * Makes the first fetch of a query use the result of a call that the server
 * made in an earlier request, before the query's key was known.
 */
export function withPipelinedResult(opts: {
  options: EntryQueryOptions;
  result: Promise<PipelinedOutcome>;
  /**
   * Whether the call is the request this fetch would make: the server filled
   * in the same input as this client did. Never rejects: what can't be
   * compared isn't the same
   */
  sameInput: (context: QueryFunctionContext<any, any>) => Promise<boolean>;
}): EntryQueryOptions {
  const { queryFn } = opts.options;
  if (queryFn === skipToken) {
    // Disabled: it never fetches
    return opts.options;
  }
  let result: Promise<PipelinedOutcome> | null = opts.result;
  return {
    ...opts.options,
    queryFn: async (context: QueryFunctionContext<any, any>) => {
      const pipelined = result;
      result = null;
      if (!pipelined || !(await opts.sameInput(context))) {
        return queryFn(context);
      }
      const outcome = await pipelined;
      switch (outcome.kind) {
        case 'data':
          // A procedure that yields: collected into a list, as the query's
          // own request would. Nothing to abort: the request is its source's
          return isAsyncIterable(outcome.data)
            ? streamIntoQuery({
                iterable: outcome.data,
                context,
                queryClient: context.client,
                abortController: new AbortController(),
              })
            : outcome.data;
        case 'error':
          throw outcome.error;
        case 'notRun':
          // Such as when the entry it reads failed and was retried
          return queryFn(context);
      }
    },
  };
}

/**
 * A query that reads other queries' data, sent through the links of its
 * client as `experimental_load()` sends one, which a link that pipelines took
 */
export interface ReadingSend {
  /** Its operation's pipeline, which an operation that reads it reads */
  pipeline: OperationPipeline;
  /**
   * What the operation ended with, after its links: an attempt of what it
   * reads that a link such as `retryLink` sends again takes it into its
   * request, and one that left it out sends it by itself, filled in. For a
   * query for every item, its runs: see `outcomeOfItem()`. Never rejects
   */
  settled: Promise<Outcome<unknown>>;
}

/**
 * Sends a query that reads other queries' data through the links of its
 * client, as `experimental_load()` does. Every link sees it, with `undefined`
 * in its input where it reads. A link that pipelines puts it in the open
 * request of what it reads if that link has that request, and sends it by
 * itself, filled in, if not: a `splitLink` may send the two to different
 * links. One that doesn't pipeline would send the blanks: the operation is
 * aborted as that link takes it, before it goes, and this gives `null`. The
 * query then sends its own request, filled in, through the same links
 */
export function sendReading(opts: {
  /** What the requests of the query's proxy go through */
  transport: unknown;
  path: string;
  /** With `undefined` for what the server fills in */
  input: unknown;
  reads: PipelineCallReads<OperationPipeline>;
  /** Whether it runs for every item of a list */
  perItem: boolean;
  /**
   * Its input, filled in, once what it reads has its data, for a link that
   * logs it with `experimental_inputOf()` and for a retry of it. `undefined`
   * for one for every item. Rejects if what it reads failed
   */
  resolve: () => Promise<unknown>;
  /** Its input, filled in, if what it reads has its data now. Else `null` */
  known: () => { input: unknown } | null;
}): ReadingSend | null {
  const { transport } = opts;
  // A proxy of a router calls procedures without links. And only what a link
  // that pipelines took has a request to go in
  if (
    !(transport instanceof TRPCUntypedClient) ||
    (opts.reads.each && !isPipelineTaken(opts.reads.each.from)) ||
    opts.reads.reads.some(
      (read) => read.kind === 'whole' && !isPipelineTaken(read.from),
    )
  ) {
    return null;
  }
  const pipeline = createOperationPipeline();
  const abort = new AbortController();
  const settled = attempt(() =>
    transport.query(opts.path, opts.input, {
      signal: abort.signal,
      context: {
        ...pipelineContext(pipeline),
        ...readsContext({
          reads: opts.reads,
          perItem: opts.perItem,
          resolve: opts.resolve,
          known: opts.known,
        }),
      },
    }),
  );
  // A link takes an operation as it is sent. One that doesn't pipeline, such
  // as an `httpLink` that a `splitLink` chose, would send it with its blanks.
  // One that pipelines and has no open request of what it reads, such as
  // another backend's, sends it by itself, filled in, once that data is there
  if (!isPipelineTaken(pipeline)) {
    abort.abort();
    return null;
  }
  return { pipeline, settled };
}
