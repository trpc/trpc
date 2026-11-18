/**
 * What a client and a server agree on about a pipelined batch: a batch whose
 * calls read parts of their inputs from the data of earlier calls in it.
 *
 * The client's half is in `./client`, the server's in `./server`. Both are
 * tested against each other, over HTTP, in `./pipeline.test.ts`.
 */

/**
 * The value of a pipelined batch's `batch` search param, where an ordinary
 * batch has `1`.
 */
export const pipelineBatch = 'pipeline';

/**
 * Where a value is in a call's data: the keys to follow. `null` stands for every
 * item of an array, so `['items', null, 'id']` is the list of the items' ids.
 */
export type PipelinePath = (string | null)[];

/** A read as it is in a request's `pipe` */
export interface PipeRead {
  /** Where the value goes in the call's input. Empty for the whole input */
  to: string[];
  /** The index of the call whose data it comes from */
  from: number;
  /** Where the value is in that call's data. Empty for all of it */
  path: PipelinePath;
  /**
   * Runs the call once for every item of the array at the first `null` in
   * `path`, each time with that item's value. The call's data is then a list
   * with a `{ result }` or an `{ error }` for every item.
   */
  each?: true;
}

/**
 * The `pipe` of a pipelined batch: the reads of each call, by the call's
 * index. It is in the body of a request that has one, beside the inputs, and
 * in the `pipe` search param of one that has none.
 */
export type PipelineReads = Record<number, PipeRead[]>;

/**
 * What a server lets a pipelined batch make it do. Each value a call reads is
 * copied into its input, so these keep what a small request can make the
 * server do in proportion to it. A call that goes over one is refused, and the
 * rest of the batch runs.
 */
export interface PipelineLimits {
  /** The longest value a call reads, in characters of JSON */
  maxValueLength: number;
  /** The most values one call reads */
  maxReadsPerCall: number;
  /**
   * The most a batch fills in, in characters of JSON: every value written
   * into an input, and the whole input of every run of a call for every item
   */
  maxFillSize: number;
  /** The most calls in a chain. A call that reads none is 1 */
  maxDepth: number;
  /** Whether a value a call reads can be an object or an array */
  allowWholeValues: boolean;
  /**
   * The most runs a batch has: each of its calls, and a call for every item
   * once for each item. `maxBatchSize` caps them too, if it is lower
   */
  maxRuns: number;
}

/**
 * The limits of a server whose `experimental_allowPipelining` is `true`.
 * Pipelining normally reads small values, such as ids, slugs and cursors.
 */
export const pipelineLimitDefaults: PipelineLimits = {
  maxValueLength: 1024,
  maxReadsPerCall: 16,
  maxFillSize: 100_000,
  maxDepth: 3,
  allowWholeValues: false,
  maxRuns: 100,
};

/**
 * A read as code writes it. `TFrom` names what it reads from: an index in a
 * request, or whatever a client has for what it sends.
 */
export interface PipelineRead<TFrom> {
  /** Where the value goes in the call's input. Empty for the whole input */
  to: string[];
  from: TFrom;
  /** Where the value is in that data. Empty for all of it */
  path: PipelinePath;
  /**
   * Runs the call once for every item of the array at the first `null` in
   * `path`, each time with that item's value
   */
  each: boolean;
}

/** A value that is the same for every run of a call */
export interface PipelineWholeRead<TFrom> {
  kind: 'whole';
  to: string[];
  from: TFrom;
  path: PipelinePath;
}

/** A value of the item a run is for */
export interface PipelineItemRead {
  kind: 'item';
  to: string[];
  /** Where the value is in the item. Empty for the item itself */
  path: PipelinePath;
}

/** The list a call runs once for every item of */
export interface PipelineList<TFrom> {
  from: TFrom;
  /** Where the list is in that data. Empty if the data is the list */
  path: string[];
}

/**
 * What a call reads. It runs once, or once for every item of one list: it
 * can't read the items of two.
 */
export type PipelineCallReads<TFrom> =
  | { kind: 'once'; reads: PipelineWholeRead<TFrom>[] }
  | {
      kind: 'each';
      list: PipelineList<TFrom>;
      /** In the order they are written to the input */
      reads: (PipelineWholeRead<TFrom> | PipelineItemRead)[];
    };

function samePath(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((segment, at) => segment === b[at]);
}

/**
 * Sorts a call's reads into what it reads once and what it reads of every
 * item. The client and the server both do this, so neither takes reads the
 * other refuses.
 */
export function groupPipelineReads<TFrom>(
  reads: readonly PipelineRead<TFrom>[],
):
  | { ok: true; reads: PipelineCallReads<TFrom> }
  | { ok: false; problem: 'each-without-list' | 'more-than-one-list' } {
  const whole: PipelineWholeRead<TFrom>[] = [];
  const all: (PipelineWholeRead<TFrom> | PipelineItemRead)[] = [];
  let list: PipelineList<TFrom> | null = null;
  for (const read of reads) {
    if (!read.each) {
      const value: PipelineWholeRead<TFrom> = {
        kind: 'whole',
        to: read.to,
        from: read.from,
        path: read.path,
      };
      whole.push(value);
      all.push(value);
      continue;
    }
    // The list is what is before the first `null`
    const listPath: string[] = [];
    for (const segment of read.path) {
      if (segment === null) {
        break;
      }
      listPath.push(segment);
    }
    if (listPath.length === read.path.length) {
      return { ok: false, problem: 'each-without-list' };
    }
    if (list && (list.from !== read.from || !samePath(list.path, listPath))) {
      return { ok: false, problem: 'more-than-one-list' };
    }
    list ??= { from: read.from, path: listPath };
    all.push({
      kind: 'item',
      to: read.to,
      path: read.path.slice(listPath.length + 1),
    });
  }
  return {
    ok: true,
    reads: list
      ? { kind: 'each', list, reads: all }
      : { kind: 'once', reads: whole },
  };
}

/** The path of one item's value: `path` with its first `null` replaced */
export function bindPipelinePath(
  path: readonly (string | null)[],
  index: number,
): PipelinePath {
  const position = path.indexOf(null);
  return path.map((segment, at) => (at === position ? String(index) : segment));
}

/**
 * Reads `path` in `value`, through own properties of objects and arrays only.
 * The client and the server read with this, so both get the same value.
 */
export function readPipelinePath(
  value: unknown,
  path: readonly (string | null)[],
): unknown {
  let current = value;
  for (const [index, segment] of path.entries()) {
    if (segment === null) {
      const rest = path.slice(index + 1);
      return Array.isArray(current)
        ? current.map((item) => readPipelinePath(item, rest))
        : undefined;
    }
    if (
      typeof current !== 'object' ||
      current === null ||
      !Object.prototype.hasOwnProperty.call(current, segment)
    ) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/**
 * One item's outcome in the data of a call that ran once for every item of a
 * list. `TError` is the error as the server sends it.
 */
export type PipelineItemEnvelope<TError> =
  | { result: { data: unknown } }
  | { error: TError };
