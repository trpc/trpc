import { isObject } from '../../utils';
import type {
  PipeCall,
  PipeEach,
  PipelineCallReads,
  PipelineItemRead,
  PipelinePipe,
  PipelineWholeRead,
  PipeRead,
} from './wire';
import {
  hasOwn,
  pipelineBatch,
  pipelineErrorEnvelope,
  pipelineMarkOf,
} from './wire';

/** A call's reads as they are in a `pipe`, where a number names each source */
export function encodePipelineReads(
  reads: PipelineCallReads<number>,
): PipeCall {
  return {
    ...(reads.each && {
      each: { from: reads.each.from, path: reads.each.path } satisfies PipeEach,
    }),
    reads: reads.reads.map((read): PipeRead =>
      read.kind === 'whole'
        ? { to: read.to, from: read.from, path: read.path }
        : { to: read.to, path: read.path },
    ),
  };
}

/** `reads` with each source's index in a request, or `null` if one has none */
function indexPipelineReads<TSource>(
  reads: PipelineCallReads<TSource>,
  indexes: ReadonlyMap<TSource, number>,
): PipelineCallReads<number> | null {
  let each: PipelineCallReads<number>['each'] = null;
  if (reads.each) {
    const from = indexes.get(reads.each.from);
    if (from === undefined) {
      return null;
    }
    each = { from, path: reads.each.path };
  }
  const indexed: (PipelineWholeRead<number> | PipelineItemRead)[] = [];
  for (const read of reads.reads) {
    if (read.kind === 'item') {
      indexed.push(read);
      continue;
    }
    const from = indexes.get(read.from);
    if (from === undefined) {
      return null;
    }
    indexed.push({ ...read, from });
  }
  return { each, reads: indexed };
}

/** The calls a client puts in a request for the server to fill in */
export interface PipelinedBatchPlan<TCall> {
  /** The calls that go in the request, after what it has without them */
  calls: TCall[];
  /** What the server fills in, by index in the request */
  pipe: PipelinePipe;
  /** The calls that don't go: they don't fit, or read what isn't in the request */
  left: TCall[];
}

/**
 * The calls that go in a request, each after everything it reads. What a call
 * reads from is whatever the client has for it: something the request has
 * already, or another call.
 */
export function planPipelinedBatch<
  TCall extends { reads: PipelineCallReads<object> },
>(opts: {
  /** What the request has without the calls, in order. `null` for what no call reads */
  sent: readonly (object | null)[];
  /** The calls that want to go in it */
  calls: readonly TCall[];
  /** Whether a request with these calls is within the client's limits */
  fits: (plan: Pick<PipelinedBatchPlan<TCall>, 'calls' | 'pipe'>) => boolean;
}): PipelinedBatchPlan<TCall> {
  const indexes = new Map<object, number>();
  for (const [index, source] of opts.sent.entries()) {
    if (source) {
      indexes.set(source, index);
    }
  }
  const plan: PipelinedBatchPlan<TCall> = { calls: [], pipe: {}, left: [] };
  let waiting = [...opts.calls];
  let placed = true;
  while (placed) {
    placed = false;
    const later: TCall[] = [];
    for (const call of waiting) {
      const reads = indexPipelineReads(call.reads, indexes);
      if (!reads) {
        // What it reads isn't in the request, or not yet
        later.push(call);
        continue;
      }
      const index = opts.sent.length + plan.calls.length;
      const next = {
        calls: [...plan.calls, call],
        pipe: { ...plan.pipe, [index]: encodePipelineReads(reads) },
      };
      if (!opts.fits(next)) {
        plan.left.push(call);
        continue;
      }
      plan.calls = next.calls;
      plan.pipe = next.pipe;
      indexes.set(call, index);
      placed = true;
    }
    waiting = later;
  }
  plan.left.push(...waiting);
  return plan;
}

/**
 * Whether the server ran each call of a request. It doesn't run a call that
 * reads the data of one that failed, or one whose list is in a call that
 * failed.
 */
export function pipelinedCallsRan<
  TCall extends { result: Promise<unknown> },
>(opts: {
  /** Whether each thing the request has before the calls succeeded */
  sent: readonly Promise<boolean>[];
  /** The request's `pipe` */
  pipe: PipelinePipe;
  /** The calls in the request, in order. A call's `result` rejects if it failed */
  calls: readonly TCall[];
}): { call: TCall; ran: Promise<boolean> }[] {
  const succeeded = [
    ...opts.sent,
    ...opts.calls.map((call) =>
      call.result.then(
        () => true,
        () => false,
      ),
    ),
  ];
  return opts.calls.map((call, index) => {
    const piped = opts.pipe[opts.sent.length + index];
    const from = [
      ...(piped?.each ? [piped.each.from] : []),
      ...(piped?.reads ?? []).flatMap((read) =>
        read.from === undefined ? [] : [read.from],
      ),
    ];
    return {
      call,
      // `false` once a source fails, without waiting for the others: the
      // server has the call's error ready then. `true` once all succeed
      ran: new Promise<boolean>((resolve) => {
        void Promise.all(
          from.map(async (source) => {
            if ((await succeeded[source]) !== true) {
              resolve(false);
            }
          }),
        ).then(() => resolve(true));
      }),
    };
  });
}

/**
 * The URL of a batch, for the same batch pipelined. `pipe` goes in it when
 * the request has no body to put it in.
 */
export function pipelinedBatchUrl(opts: {
  /** The URL of an ordinary batch: it has `batch=1` */
  url: string;
  pipe: PipelinePipe | null;
}) {
  const url = opts.url.replace(
    /([?&])batch=1(?=&|$)/,
    `$1batch=${pipelineBatch}`,
  );
  // A GET's server would read the link's, or both. Refused for any method,
  // so a link works, or doesn't, whatever method a batch goes with
  const search = url.slice(url.indexOf('?') + 1).split('#')[0];
  if (new URLSearchParams(search).has('pipe')) {
    throw new Error(
      `The link's URL has a "pipe" search param: "pipe" is reserved for pipelining, like "input" and "batch"`,
    );
  }
  if (!opts.pipe) {
    return url;
  }
  return `${url}&pipe=${encodeURIComponent(JSON.stringify(opts.pipe))}`;
}

/**
 * The body of a batch, for the same batch pipelined: its inputs by index,
 * with its `pipe` beside them.
 */
export function pipelinedBatchBody(opts: {
  /** The body of an ordinary batch: the JSON of its inputs by index */
  body: string;
  pipe: PipelinePipe;
}) {
  return JSON.stringify({ ...JSON.parse(opts.body), pipe: opts.pipe });
}

/**
 * The runs of a call for every item, from a response that doesn't stream,
 * with `deserialize` applied to each run's data and error, as a link applies
 * it to a call's
 */
export function deserializePipelinedItems(
  value: unknown,
  deserialize: (value: unknown) => unknown,
): unknown {
  if (!isObject(value)) {
    return value;
  }
  const { items } = value;
  if (isObject(items)) {
    const deserialized: Record<string, unknown> = {};
    for (const [index, item] of Object.entries(items)) {
      deserialized[index] = deserializePipelinedItems(item, deserialize);
    }
    return { items: deserialized };
  }
  if (hasOwn(value, 'error')) {
    // The server's mark is beside the error, and stays there
    return pipelineErrorEnvelope(
      deserialize(value['error']),
      pipelineMarkOf(value),
    );
  }
  return isObject(value['result'])
    ? { result: { data: deserialize(value['result']['data']) } }
    : value;
}

/** One run's outcome of a call that the server ran once for every item */
export type PipelinedItem =
  | { kind: 'data'; data: unknown }
  /** As the server sent it */
  | { kind: 'error'; error: unknown }
  /** The server sent nothing for the item, or its list couldn't run */
  | { kind: 'missing' };

/**
 * Reads one run's outcome from what a response has for a call that ran once
 * for every item: its `items`, by index, one level for each level of lists,
 * down to a `{ result }` or an `{ error }`. A streamed one has each level,
 * and each run, as a promise of its own, so it waits only for that run.
 */
export async function readPipelinedItem(
  value: unknown,
  /** An index for each level of lists */
  indexes: readonly number[],
): Promise<PipelinedItem> {
  let node: unknown = await value;
  for (const index of indexes) {
    const items: unknown = isObject(node) ? await node['items'] : undefined;
    if (!isObject(items) || !hasOwn(items, String(index))) {
      return { kind: 'missing' };
    }
    node = await items[index];
  }
  if (!isObject(node)) {
    return { kind: 'missing' };
  }
  const result = node['result'];
  if (isObject(result)) {
    return { kind: 'data', data: result['data'] };
  }
  return node['error']
    ? { kind: 'error', error: node['error'] }
    : { kind: 'missing' };
}
