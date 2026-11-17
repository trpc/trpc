import { isObject } from '../../utils';
import type {
  PipelineCallReads,
  PipelineItemRead,
  PipelineReads,
  PipelineWholeRead,
  PipeRead,
} from './wire';
import { pipelineBatch, readPipelinePath } from './wire';

/** A call's reads as they are in a `pipe`, where a number names each source */
export function encodePipelineReads(
  reads: PipelineCallReads<number>,
): PipeRead[] {
  switch (reads.kind) {
    case 'once':
      return reads.reads.map((read) => ({
        to: read.to,
        from: read.from,
        path: read.path,
      }));
    case 'each':
      return reads.reads.map((read) =>
        read.kind === 'whole'
          ? { to: read.to, from: read.from, path: read.path }
          : {
              to: read.to,
              from: reads.list.from,
              path: [...reads.list.path, null, ...read.path],
              each: true,
            },
      );
  }
}

/** `reads` with each source's index in a request, or `null` if one has none */
function indexPipelineReads<TSource>(
  reads: PipelineCallReads<TSource>,
  indexes: ReadonlyMap<TSource, number>,
): PipelineCallReads<number> | null {
  const whole = (read: PipelineWholeRead<TSource>) => {
    const from = indexes.get(read.from);
    return from === undefined ? null : { ...read, from };
  };
  switch (reads.kind) {
    case 'once': {
      const indexed: PipelineWholeRead<number>[] = [];
      for (const read of reads.reads) {
        const value = whole(read);
        if (!value) {
          return null;
        }
        indexed.push(value);
      }
      return { kind: 'once', reads: indexed };
    }
    case 'each': {
      const from = indexes.get(reads.list.from);
      if (from === undefined) {
        return null;
      }
      const indexed: (PipelineWholeRead<number> | PipelineItemRead)[] = [];
      for (const read of reads.reads) {
        const value = read.kind === 'whole' ? whole(read) : read;
        if (!value) {
          return null;
        }
        indexed.push(value);
      }
      return {
        kind: 'each',
        list: { from, path: reads.list.path },
        reads: indexed,
      };
    }
  }
}

/** The calls a client puts in a request for the server to fill in */
export interface PipelinedBatchPlan<TCall> {
  /** The calls that go in the request, after what it has without them */
  calls: TCall[];
  /** What the server fills in, by index in the request */
  reads: PipelineReads;
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
  fits: (plan: Pick<PipelinedBatchPlan<TCall>, 'calls' | 'reads'>) => boolean;
}): PipelinedBatchPlan<TCall> {
  const indexes = new Map<object, number>();
  for (const [index, source] of opts.sent.entries()) {
    if (source) {
      indexes.set(source, index);
    }
  }
  const plan: PipelinedBatchPlan<TCall> = { calls: [], reads: {}, left: [] };
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
        reads: { ...plan.reads, [index]: encodePipelineReads(reads) },
      };
      if (!opts.fits(next)) {
        plan.left.push(call);
        continue;
      }
      plan.calls = next.calls;
      plan.reads = next.reads;
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
 * reads the data of one that failed.
 */
export function pipelinedCallsRan<
  TCall extends { result: Promise<unknown> },
>(opts: {
  /** Whether each thing the request has before the calls succeeded */
  sent: readonly Promise<boolean>[];
  /** The request's `pipe` */
  reads: PipelineReads;
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
  return opts.calls.map((call, index) => ({
    call,
    ran: Promise.all(
      (opts.reads[opts.sent.length + index] ?? []).map(
        async (read) => (await succeeded[read.from]) === true,
      ),
    ).then((sources) => sources.every(Boolean)),
  }));
}

/**
 * The URL of a batch, for the same batch pipelined. `pipe` goes in it when
 * the request has no body to put it in.
 */
export function pipelinedBatchUrl(opts: {
  /** The URL of an ordinary batch: it has `batch=1` */
  url: string;
  pipe: PipelineReads | null;
}) {
  const url = opts.url.replace(
    /([?&])batch=1(?=&|$)/,
    `$1batch=${pipelineBatch}`,
  );
  return opts.pipe
    ? `${url}&pipe=${encodeURIComponent(JSON.stringify(opts.pipe))}`
    : url;
}

/**
 * The body of a batch, for the same batch pipelined: its inputs by index,
 * with its `pipe` beside them.
 */
export function pipelinedBatchBody(opts: {
  /** The body of an ordinary batch: the JSON of its inputs by index */
  body: string;
  pipe: PipelineReads;
}) {
  return JSON.stringify({ ...JSON.parse(opts.body), pipe: opts.pipe });
}

/** One item's outcome of a call that the server ran once for every item of a list */
export type PipelinedItem =
  | { kind: 'data'; data: unknown }
  /** As the server sent it */
  | { kind: 'error'; error: unknown }
  /** The server sent nothing for the item */
  | { kind: 'missing' };

/**
 * Reads one item's outcome from the data of a call that ran once for every
 * item of a list: a `{ result }` or an `{ error }` for each.
 */
export function readPipelinedItem(data: unknown, index: number): PipelinedItem {
  const envelope = readPipelinePath(data, [String(index)]);
  if (!isObject(envelope)) {
    return { kind: 'missing' };
  }
  const result = envelope['result'];
  if (isObject(result)) {
    return { kind: 'data', data: result['data'] };
  }
  return envelope['error']
    ? { kind: 'error', error: envelope['error'] }
    : { kind: 'missing' };
}
