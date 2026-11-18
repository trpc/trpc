/**
 * What a client and a server agree on about a pipelined batch: a batch whose
 * calls read parts of their inputs from the data of earlier calls in it.
 *
 * The client's half is in `./client`, the server's in `./server`. Both are
 * tested against each other, over HTTP, in `./pipeline.test.ts`.
 *
 * ## The request
 *
 * An ordinary batch, `?batch=pipeline`: every call is a path in the URL and
 * an input in the batch's `input`, by index. Its `pipe` says what each call
 * reads, by the call's index. It is in the body of a request that has one,
 * beside the inputs, and in the `pipe` search param of one that has none.
 * Here, the author of every post of call 0, and the posts of each author's
 * team:
 *
 * ```http
 * GET /post.list,author.byId,post.byTeam?batch=pipeline&input=…&pipe=…
 * ```
 *
 * ```json
 * {
 *   "1": { "each": { "from": 0, "path": ["items"] },
 *          "reads": [{ "to": ["id"], "path": ["authorId"] }] },
 *   "2": { "reads": [{ "to": ["teamId"], "from": 1, "path": ["teamId"] }] }
 * }
 * ```
 *
 * - A **read**, `{ to, from, path }`, writes the value at `path` in the data
 *   of call `from` into the input at `to`. `null` in a path is every item of
 *   a list there: `["items", null, "id"]` is the list of the items' ids.
 * - **`each: { from, path }`** runs the call once for every item of the list
 *   at `path` in call `from`'s data. A `null` in its path is a level of
 *   lists: `["pages", null, "items"]` is every item of every page. A read
 *   without `from` reads the item, which only a call with `each` has.
 * - What can be left out is a key, never a place in an array: in an array,
 *   `JSON.stringify` makes `undefined` a `null`, which is a value an input
 *   can have. A batch's inputs are by index in an object for the same reason
 *   (trpc/trpc#669).
 *
 * ## Frames
 *
 * A call's frame is the items it runs for, an index for every level of
 * lists. A call with `each` adds its levels to the frame of its `from`. A
 * call without it runs in the frame of what it reads: one that reads a call
 * for every item runs once for every item too, and its run for item 3 reads
 * run 3. What a call reads has its frame, or one its frame starts with. A
 * call runs once everything it reads is ready.
 *
 * ## The response
 *
 * A list of the calls' outcomes, by index, as in any batch. A call that runs
 * for every item has `{ items }`, by the item's index, one level for each
 * level of lists, down to a `{ result }` or an `{ error }` for each run:
 *
 * ```json
 * [
 *   { "result": { "data": { "items": [{ "authorId": "ada" }] } } },
 *   { "items": { "0": { "result": { "data": { "teamId": 1 } } } } },
 *   { "items": { "0": { "result": { "data": [] } } } }
 * ]
 * ```
 *
 * - A list that can't run, as the call it is in failed, is an `{ error }`
 *   with the code `PRECONDITION_FAILED`, in place of its items. What isn't a
 *   list has no items: `{ items: {} }`.
 * - A run fails by itself, and a run that reads a failed one doesn't run.
 * - Streamed, the `items` of a level and each of its items are values of
 *   their own, so each run arrives when it is ready, in any order.
 */

/**
 * The value of a pipelined batch's `batch` search param, where an ordinary
 * batch has `1`.
 */
export const pipelineBatch = 'pipeline';

/**
 * Where a value is: the keys to follow. `null` stands for every item of a
 * list, so `['items', null, 'id']` is the list of the items' ids.
 */
export type PipelinePath = (string | null)[];

/** A read as it is in a request's `pipe` */
export interface PipeRead {
  /** Where the value goes in the call's input. Empty for the whole input */
  to: string[];
  /**
   * The index of the call whose data it comes from. Left out for the item a
   * run is for
   */
  from?: number;
  /** Where the value is in that data. Empty for all of it */
  path: PipelinePath;
}

/** The list a call runs once for every item of, as it is in a request */
export interface PipeEach {
  /** The index of the call whose data it is in */
  from: number;
  /** Where it is in that data. A `null` is a level of lists */
  path: PipelinePath;
}

/** What a call reads, as it is in a request's `pipe` */
export interface PipeCall {
  each?: PipeEach;
  reads: PipeRead[];
}

/** The `pipe` of a pipelined batch: what each call reads, by its index */
export type PipelinePipe = Record<number, PipeCall>;

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
  /** The most calls in a chain of reads. A call that reads none is 1 */
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
 * A value that a call reads of another, the same for each run that reads
 * the same run of it. `TFrom` names what it reads from: an index in a
 * request, or whatever a client or a server has for a call.
 */
export interface PipelineWholeRead<TFrom> {
  kind: 'whole';
  /** Where the value goes in the call's input. Empty for the whole input */
  to: string[];
  from: TFrom;
  /** Where the value is in that data. Empty for all of it */
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
  /** Where the list is in that data. A `null` is a level of lists */
  path: PipelinePath;
}

/** What a call reads, as code has it */
export interface PipelineCallReads<TFrom> {
  /** The list it runs once for every item of, or `null` if it has none */
  each: PipelineList<TFrom> | null;
  /** In the order they are written to the input */
  reads: (PipelineWholeRead<TFrom> | PipelineItemRead)[];
}

/** The path to each level of a list: its path, split at each `null` */
export function pipelineListLevels(
  path: PipelinePath,
): [string[], ...string[][]] {
  let level: string[] = [];
  const levels: [string[], ...string[][]] = [level];
  for (const segment of path) {
    if (segment === null) {
      level = [];
      levels.push(level);
    } else {
      level.push(segment);
    }
  }
  return levels;
}

/**
 * The items a call runs for: one level of a list, in the frame of what the
 * list is in. A list of lists is a frame for each level, each in the one
 * before, so a call over `["pages"]` and one over `["pages", null, "items"]`
 * of the same call share the frame of the pages. `null`, as a frame, is the
 * one run of a call that runs once.
 */
export interface PipelineFrame<TFrom> {
  /** The frame the list is in: of the call it is in, or of the level before */
  parent: PipelineFrame<TFrom> | null;
  /** The list, as its call and its path down to this level */
  list: PipelineList<TFrom>;
  /**
   * For a level after the first: where its list is in the item of the level
   * before. `null` for the first, whose list is in the data of `list.from`
   */
  inItem: string[] | null;
  /** How many indexes a run has: one for every level of lists, the parent's too */
  depth: number;
}

function samePath(a: PipelinePath, b: PipelinePath) {
  return a.length === b.length && a.every((segment, at) => segment === b[at]);
}

function sameFrame<TFrom>(
  a: PipelineFrame<TFrom> | null,
  b: PipelineFrame<TFrom> | null,
): boolean {
  if (!a || !b) {
    return a === b;
  }
  return (
    a.depth === b.depth &&
    a.list.from === b.list.from &&
    samePath(a.list.path, b.list.path) &&
    sameFrame(a.parent, b.parent)
  );
}

/** Whether `frame` starts with `start`: its runs are each in one of `start`'s */
function startsWith<TFrom>(
  frame: PipelineFrame<TFrom> | null,
  start: PipelineFrame<TFrom> | null,
) {
  let at = frame;
  while (at && at.depth > (start?.depth ?? 0)) {
    at = at.parent;
  }
  return sameFrame(at, start);
}

/**
 * The frame of a call, from the frames of what it reads, and whether what it
 * reads fits in it. It doesn't if what it reads runs for the items of
 * different lists: a call can't run for both. The client and the server both
 * work it out with this, so neither takes a call the other refuses.
 */
export function pipelineFrameOf<TFrom>(opts: {
  reads: PipelineCallReads<TFrom>;
  frameOf: (from: TFrom) => PipelineFrame<TFrom> | null;
}): { frame: PipelineFrame<TFrom> | null; fits: boolean } {
  const { each } = opts.reads;
  const sources: (PipelineFrame<TFrom> | null)[] = [];
  for (const read of opts.reads.reads) {
    if (read.kind === 'whole') {
      sources.push(opts.frameOf(read.from));
    }
  }
  let frame: PipelineFrame<TFrom> | null = null;
  if (each) {
    // A frame for each level, in the one before
    frame = opts.frameOf(each.from);
    let path: PipelinePath = [];
    for (const [at, level] of pipelineListLevels(each.path).entries()) {
      path = at === 0 ? level : [...path, null, ...level];
      frame = {
        parent: frame,
        list: { from: each.from, path },
        inItem: at === 0 ? null : level,
        depth: (frame?.depth ?? 0) + 1,
      };
    }
  } else {
    // The deepest of them, which the others have to be the start of
    for (const source of sources) {
      if ((source?.depth ?? 0) > (frame?.depth ?? 0)) {
        frame = source;
      }
    }
  }
  return {
    frame,
    fits: sources.every((source) => startsWith(frame, source)),
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

/** Whether `value` is an object or an array with `key` as its own property */
export function hasOwn(value: unknown, key: string) {
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.prototype.hasOwnProperty.call(value, key)
  );
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
    if (!hasOwn(current, segment)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/** The outcome of one run, as a response has it */
export type PipelineItemEnvelope<TError> =
  | { result: { data: unknown } }
  | { error: TError };

/**
 * What a response has for a call that runs for every item: its runs, by the
 * item's index, one level for each level of lists. A list that can't run is
 * an `{ error }`.
 */
export type PipelineItemsResponse<TError> =
  | PipelineItemEnvelope<TError>
  | { items: Record<string, PipelineItemsResponse<TError>> };
