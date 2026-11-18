import { getTRPCErrorFromUnknown, TRPCError } from '../../error/TRPCError';
import { isPromise } from '../../stream/jsonl';
import { createDeferred } from '../../stream/utils/createDeferred';
import type { Deferred } from '../../stream/utils/createDeferred';
import type { CombinedDataTransformer } from '../../transformer';
import { isAsyncIterable, isObject } from '../../utils';
import type { experimental_PipeliningOptions } from '../types';
import type {
  PipelineCallReads,
  PipelineFrame,
  PipelineItemEnvelope,
  PipelineLimits,
  PipelineList,
  PipelinePath,
} from './wire';
import {
  pipelineFrameOf,
  pipelineLimitDefaults,
  readPipelinePath,
} from './wire';

/**
 * The limits a handler's `experimental_allowPipelining` sets, or `null` if it
 * doesn't accept pipelined batches
 */
export function pipelineLimitsOf(
  option: boolean | experimental_PipeliningOptions | undefined,
): PipelineLimits | null {
  if (!option) {
    return null;
  }
  if (option === true) {
    return pipelineLimitDefaults;
  }
  return {
    maxValueLength:
      option.maxValueLength ?? pipelineLimitDefaults.maxValueLength,
    maxReadsPerCall:
      option.maxReadsPerCall ?? pipelineLimitDefaults.maxReadsPerCall,
    maxFillSize: option.maxFillSize ?? pipelineLimitDefaults.maxFillSize,
    maxDepth: option.maxDepth ?? pipelineLimitDefaults.maxDepth,
    allowWholeValues:
      option.allowWholeValues ?? pipelineLimitDefaults.allowWholeValues,
    maxRuns: option.maxRuns ?? pipelineLimitDefaults.maxRuns,
  };
}

/** The `pipe` of a request that has no body, not yet checked */
export function pipeOfSearchParams(searchParams: URLSearchParams) {
  return searchParams.get('pipe') ?? undefined;
}

/** The `pipe` beside the inputs in a request's body, not yet checked */
export function pipeOfBody(body: unknown): unknown {
  return isObject(body) ? body['pipe'] : undefined;
}

function invalidPipe(message: string) {
  return new TRPCError({
    code: 'BAD_REQUEST',
    message: `Invalid "pipe": ${message}`,
  });
}

function isKeys(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((segment) => typeof segment === 'string')
  );
}

function isPath(value: unknown): value is PipelinePath {
  return (
    Array.isArray(value) &&
    value.every((segment) => segment === null || typeof segment === 'string')
  );
}

/**
 * Validates the `pipe` of a batch request: what each call reads, by the
 * call's index. A string is the search param's JSON. A request without one
 * has nothing to fill in. Nothing after this checks it again.
 *
 * A read, and a list, names its source by index. It comes back as what
 * `sources` has for that call, so a read from a call that isn't there, or
 * isn't earlier, can't come out of this.
 */
export function parsePipelineReads<TSource extends object | number>(opts: {
  pipe: unknown;
  /** What stands for each call of the batch, in order */
  sources: readonly TSource[];
}): Map<number, PipelineCallReads<TSource>> {
  let parsed = opts.pipe;
  if (parsed === undefined) {
    return new Map();
  }
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      throw invalidPipe('not JSON');
    }
  }
  if (!isObject(parsed)) {
    throw invalidPipe('expected an object');
  }
  return new Map(
    Object.entries(parsed).map(([key, call]) => {
      const index = Number(key);
      if (
        !Number.isInteger(index) ||
        index < 0 ||
        index >= opts.sources.length ||
        // One key per call: `01` is not another way to write `1`
        String(index) !== key
      ) {
        throw invalidPipe(`no call at index ${key}`);
      }
      if (!isObject(call) || !Array.isArray(call['reads'])) {
        throw invalidPipe(`expected "reads" at ${key}`);
      }
      const sourceOf = (from: unknown) => {
        // Only earlier calls, so calls can't wait for each other
        const source =
          typeof from === 'number' && Number.isInteger(from) && from < index
            ? opts.sources[from]
            : undefined;
        if (source === undefined) {
          throw invalidPipe(`call ${key} can only read from an earlier call`);
        }
        return source;
      };
      const list = call['each'];
      let each: PipelineList<TSource> | null = null;
      if (list !== undefined) {
        if (!isObject(list) || !isPath(list['path'])) {
          throw invalidPipe(`expected "from" and "path" in "each" at ${key}`);
        }
        each = { from: sourceOf(list['from']), path: list['path'] };
      }
      const reads = call['reads'].map(
        (read: unknown): PipelineCallReads<TSource>['reads'][number] => {
          if (!isObject(read) || !isKeys(read['to']) || !isPath(read['path'])) {
            throw invalidPipe(`expected "to" and "path" at ${key}`);
          }
          if (read['from'] !== undefined) {
            return {
              kind: 'whole',
              to: read['to'],
              from: sourceOf(read['from']),
              path: read['path'],
            };
          }
          // What reads no call reads the item a run is for
          if (!each) {
            throw invalidPipe(
              `call ${key} reads an item without "each", or has no "from"`,
            );
          }
          return { kind: 'item', to: read['to'], path: read['path'] };
        },
      );
      return [index, { each, reads }];
    }),
  );
}

/**
 * Whether a value can be copied with one of its properties replaced: an
 * array, a plain object or an instance of a class. Not what keeps its state
 * out of its properties, such as a `Map` or a `Date`, or a class that names
 * itself with `Symbol.toStringTag`: it can't be told from one of those.
 */
function isRecordLike(value: object) {
  return (
    Array.isArray(value) ||
    Object.prototype.toString.call(value) === '[object Object]'
  );
}

/**
 * `input` with `value` at `to`. It copies what is on the way there and
 * changes nothing in place: an input can be data that another call reads too.
 */
function writePipelinePath(opts: {
  input: unknown;
  to: readonly string[];
  value: unknown;
}): unknown {
  const write = (target: unknown, depth: number): unknown => {
    const key = opts.to[depth];
    if (key === undefined) {
      return opts.value;
    }
    if (
      typeof target !== 'object' ||
      target === null ||
      // In an array, only an item it has: not its `length`
      (Array.isArray(target) &&
        !(
          /^(0|[1-9]\d*)$/.test(key) &&
          Object.prototype.hasOwnProperty.call(target, key)
        ))
    ) {
      throw invalidPipe(`the input has nothing at "${opts.to.join('.')}"`);
    }
    if (!isRecordLike(target)) {
      throw invalidPipe(
        `the input has a value on the way to "${opts.to.join('.')}" that can't be written to`,
      );
    }
    // With its prototype: an input's transformer can make it a class instance
    const copy: object = Array.isArray(target)
      ? [...target]
      : Object.create(
          Object.getPrototypeOf(target),
          Object.getOwnPropertyDescriptors(target),
        );
    // Not an assignment, which would set the prototype for a `__proto__` key
    Object.defineProperty(copy, key, {
      value: write(
        Object.prototype.hasOwnProperty.call(target, key)
          ? (target as Record<string, unknown>)[key]
          : undefined,
        depth + 1,
      ),
      writable: true,
      enumerable: true,
      configurable: true,
    });
    return copy;
  };
  return write(opts.input, 0);
}

/** A value as it is after a trip over the wire. What JSON can't carry is left out */
function overTheWire(
  transformer: CombinedDataTransformer['input' | 'output'],
  value: unknown,
) {
  const json = JSON.stringify(transformer.serialize(value));
  return json === undefined
    ? undefined
    : transformer.deserialize(JSON.parse(json));
}

/** What a call that reads a failed call gets */
function sourceFailed() {
  return new TRPCError({
    code: 'PRECONDITION_FAILED',
    message: `The call this call reads its input from failed`,
  });
}

/** Thrown inside `readableData` for a part of the data that is still to come */
class StillToCome extends Error {}

/**
 * A call's data as the client gets it, for the calls that read it. Throws if
 * some of it is still to come, as a stream sends it: what JSON makes of that
 * is `{}`, which isn't what the client gets. Data that can't go over the wire
 * at all fails the call itself, so what reads it gets what it gets for a
 * failed call.
 */
function readableData(
  transformer: CombinedDataTransformer['output'],
  data: unknown,
) {
  try {
    const json = JSON.stringify(
      transformer.serialize(data),
      (_key, value: unknown) => {
        if (isPromise(value) || isAsyncIterable(value)) {
          throw new StillToCome();
        }
        return value;
      },
    );
    return json === undefined
      ? undefined
      : transformer.deserialize(JSON.parse(json));
  } catch (cause) {
    if (cause instanceof StillToCome) {
      throw new TRPCError({
        code: 'UNSUPPORTED_MEDIA_TYPE',
        message: 'Cannot read the data of a stream-like response',
      });
    }
    throw sourceFailed();
  }
}

/** A call refused for going over one of the server's limits */
function overLimit(message: string) {
  return new TRPCError({ code: 'BAD_REQUEST', message });
}

/**
 * Measures about how long values are as JSON, for the limits on how long a
 * value is and on what a batch fills in. It stops once a value is longer than `room`, and gives a length
 * over `room` then: what is that long isn't filled in, so its exact length
 * doesn't matter, and it reads no more of it than the room there is. Only
 * listing an object's keys takes as long as the object. That is once for
 * each object, or again for a call with more room, and the data calls read is
 * the server's own, which went over the wire whole already. It remembers what
 * it measured, so what many runs or calls read is measured once.
 */
export function createPipelineSizeOf() {
  /** An object's length, or how long it is at least if `exact` is false */
  const objects = new WeakMap<object, { size: number; exact: boolean }>();
  const strings = new Map<string, number>();
  const sizeOf = (value: unknown, room: number): number => {
    if (typeof value === 'string') {
      // Its length, with its quotes, is as long as it can be at least
      if (value.length + 2 > room) {
        return value.length + 2;
      }
      // With its escapes, which are up to six characters for one
      let size = strings.get(value);
      if (size === undefined) {
        size = JSON.stringify(value).length;
        strings.set(value, size);
      }
      return size;
    }
    if (typeof value === 'number' && !Number.isFinite(value)) {
      // JSON writes `null` for it
      return 4;
    }
    if (
      typeof value === 'number' ||
      typeof value === 'bigint' ||
      typeof value === 'boolean'
    ) {
      return String(value).length;
    }
    if (hasToJSON(value)) {
      // As JSON has it, such as a `Date`'s string. A function can have one too
      return sizeOf(value.toJSON(), room);
    }
    if (typeof value !== 'object' || value === null) {
      return 4;
    }
    const known = objects.get(value);
    if (known && (known.exact || known.size > room)) {
      return known.size;
    }
    // A value inside itself counts once
    objects.set(value, { size: 0, exact: true });
    let size = 2;
    /** Adds a part. Whether the value is longer than the room then */
    const add = (part: unknown) => {
      size += sizeOf(part, room - size);
      return size > room;
    };
    let over: boolean;
    try {
      over = addParts(value, add, (length) => (size += length));
    } catch (cause) {
      // Not measured: the next read measures it again
      objects.delete(value);
      throw cause;
    }
    objects.set(value, { size, exact: !over });
    return size;
  };
  return sizeOf;
}

/**
 * Adds each part of an object, and the `,` and `:` JSON writes between them,
 * until `add` says the object is longer than the room. Whether it is
 */
function addParts(
  value: object,
  add: (part: unknown) => boolean,
  addSeparators: (length: number) => void,
) {
  let over = false;
  if (Symbol.iterator in value) {
    // An array, or what a transformer makes, such as a `Map` or a `Set`
    let index = 0;
    for (const part of value as Iterable<unknown>) {
      // A `,` before each but the first
      addSeparators(index++ === 0 ? 0 : 1);
      if ((over = add(part))) {
        break;
      }
    }
  } else {
    // A property is read once the room is known to have what is before it.
    // The room bounds what JSON writes, not what is read: a property JSON
    // leaves out is read, and counts for nothing
    let first = true;
    for (const key of Object.keys(value)) {
      const part = (value as Record<string, unknown>)[key];
      if (leftOut(part)) {
        // JSON writes neither it nor its key
        continue;
      }
      // A `,` before each but the first, and a `:` after its key
      addSeparators((first ? 0 : 1) + 1);
      first = false;
      if ((over = add(key) || add(part))) {
        break;
      }
    }
  }
  return over;
}

/** Whether JSON writes this value as what its `toJSON` gives */
function hasToJSON(value: unknown): value is { toJSON: () => unknown } {
  return (
    ((typeof value === 'object' && value !== null) ||
      typeof value === 'function') &&
    'toJSON' in value &&
    typeof value.toJSON === 'function'
  );
}

/** Whether JSON leaves a property with this value out of an object */
function leftOut(value: unknown) {
  return (
    value === undefined ||
    (typeof value === 'function' && !hasToJSON(value)) ||
    typeof value === 'symbol'
  );
}

/** What the server needs of a batch's call to fill in its input */
export interface PipelineServerCall {
  /** The input as the client sent it */
  getRawInput: () => Promise<unknown>;
  /** The input, once it has been read */
  result: () => unknown;
}

/**
 * The runs of a call that runs for every item, as a response has them: by
 * the item's index, one level for each level of lists, down to the outcome
 * of each run. A list that can't run is an `{ error }`. Each level, and each
 * run, is a promise of its own, ready when it is.
 */
export type PipelineRuns<TError> = Promise<
  PipelineItemEnvelope<TError> | { items: PipelineRuns<TError>[] }
>;

/**
 * Runs a call once for every item of its frame, and gives every run's
 * outcome: what `item` returned, or what `error` made of what it threw. A
 * list that can't run gets what `error` makes of why.
 */
export type PipelineEach = <TError>(run: {
  item: (input: unknown) => Promise<unknown>;
  error: (cause: unknown, input: unknown) => TError;
}) => PipelineRuns<TError>;

/**
 * How a call of a pipelined batch that reads values runs: once, with an input
 * that is filled in before it runs, or once for every item of its frame. It
 * runs after its input is filled in even when nothing of it reads its input:
 * a procedure without an input parser is refused, or doesn't run, as any
 * other.
 */
export type PipelineCallRun =
  | { kind: 'once'; input: () => Promise<unknown> }
  | { kind: 'each'; each: PipelineEach };

/**
 * The places of a frame: one level of items for each level of lists, down to
 * a value for each run. A list that can't run has failed in place of its
 * items. Each is ready when it is.
 */
type Places<TValue> = Promise<PlacesNode<TValue>>;
type PlacesNode<TValue> =
  | { kind: 'run'; value: TValue }
  | { kind: 'items'; items: Places<TValue>[] }
  | { kind: 'failed'; error: TRPCError };

/** Where a run is: an index for each level of lists, and its item */
interface Place {
  indexes: number[];
  item: unknown;
}

/** `places` with what `fn` makes of each run's value */
function mapPlaces<TFrom, TTo>(
  places: Places<TFrom>,
  fn: (value: TFrom) => PlacesNode<TTo> | Places<TTo>,
): Places<TTo> {
  return places.then((node) => {
    switch (node.kind) {
      case 'run':
        return fn(node.value);
      case 'items':
        return {
          kind: 'items',
          items: node.items.map((item) => mapPlaces(item, fn)),
        };
      case 'failed':
        return node;
    }
  });
}

/** The places of the items of a list, in the place the list is in */
function itemsOf(opts: {
  list: unknown;
  /** The indexes of the place the list is in */
  indexes: readonly number[];
  /**
   * Why a list this long can't run, or `null` if it can. Nothing is made for
   * its items then: no call could hold a place for each
   */
  tooLong: (length: number) => TRPCError | null;
}): PlacesNode<Place> {
  const { list } = opts;
  // What is no list has no items
  if (!Array.isArray(list)) {
    return { kind: 'items', items: [] };
  }
  const error = opts.tooLong(list.length);
  if (error) {
    return { kind: 'failed', error };
  }
  // By index: a list with holes has a run for each of them too
  return {
    kind: 'items',
    items: Array.from(list.keys(), (index) =>
      Promise.resolve<PlacesNode<Place>>({
        kind: 'run',
        value: { indexes: [...opts.indexes, index], item: list[index] },
      }),
    ),
  };
}

/**
 * Makes the calls of a batch read parts of their input from the data of
 * earlier calls, as its `pipe` says. Throws if the `pipe` is invalid.
 */
export function pipelineCalls<TCall extends PipelineServerCall>(opts: {
  calls: readonly TCall[];
  /** The request's `pipe`, not yet checked. `undefined` if it has none */
  pipe: unknown;
  transformer: CombinedDataTransformer;
  /**
   * The most runs of a call the batch may have, or `null` for any number. A
   * call for every item runs once for each item. Of two such calls that are
   * over it together, the one whose list is ready first runs.
   */
  maxRuns: number | null;
  /** What the server lets the batch make it do */
  limits: PipelineLimits;
}) {
  const { limits } = opts;
  const sizeOf = createPipelineSizeOf();
  /** A run of a call, as the calls that read it see it */
  interface Run {
    /** How it went: its data, or a rejection if it has none to read */
    outcome: Deferred<unknown>;
    /** Its data as the client gets it, which is what a path refers to */
    clientData: Promise<unknown> | null;
  }
  /** A call, as the calls that read its data see it */
  interface Source {
    index: number;
    /** Its place in its chain of reads: 1 for a call that reads none */
    depth: number;
    /** The items it runs for, or `null` if it runs once */
    frame: PipelineFrame<Source> | null;
    /** Its runs, at the places of its frame */
    runs: Deferred<PlacesNode<Run>>;
    /** Whether what it reads runs for the items of different lists */
    framesDiffer: boolean;
    /**
     * Whether it has begun to read: from then on, it gives back its own
     * place if it doesn't run
     */
    started: boolean;
  }
  const newRun = (): Run => {
    const outcome = createDeferred<unknown>();
    // A failed run that nothing reads from isn't an unhandled rejection
    outcome.promise.catch(() => undefined);
    return { outcome, clientData: null };
  };
  const sent = opts.calls.map((call, index) => {
    const source: Source = {
      index,
      depth: 1,
      frame: null,
      runs: createDeferred<PlacesNode<Run>>(),
      framesDiffer: false,
      started: false,
    };
    return { call, source };
  });
  const plan = parsePipelineReads({
    pipe: opts.pipe,
    sources: sent.map((it) => it.source),
  });
  // A call reads only earlier calls, so theirs are known by its turn
  for (const [index, { source }] of sent.entries()) {
    const reads = plan.get(index);
    if (reads) {
      const from = reads.reads.flatMap((read) =>
        read.kind === 'whole' ? [read.from] : [],
      );
      if (reads.each) {
        from.push(reads.each.from);
      }
      // 1 for a call whose reads are empty, as for one that has none. A loop,
      // as a spread of a long list of reads would overflow the stack
      let deepest = 0;
      for (const it of from) {
        deepest = Math.max(deepest, it.depth);
      }
      source.depth = 1 + deepest;
      const framed = pipelineFrameOf({ reads, frameOf: (it) => it.frame });
      source.frame = framed.frame;
      source.framesDiffer = !framed.fits;
    }
  }
  /** Why a call is refused before it reads anything, if it is */
  function refusalOf(source: Source, reads: PipelineCallReads<Source>) {
    if (reads.reads.length > limits.maxReadsPerCall) {
      return overLimit(
        `This call reads ${reads.reads.length} values, more than \`maxReadsPerCall\` (${limits.maxReadsPerCall}) allows`,
      );
    }
    if (source.depth > limits.maxDepth) {
      return overLimit(
        `This call is ${source.depth} calls deep in a chain, more than \`maxDepth\` (${limits.maxDepth}) allows`,
      );
    }
    if (source.framesDiffer) {
      return invalidPipe(
        `call ${source.index} reads calls that run for the items of different lists`,
      );
    }
    return null;
  }
  /** Checks a value before it is written into an input */
  function checkValue(value: unknown) {
    if (
      !limits.allowWholeValues &&
      typeof value === 'object' &&
      value !== null
    ) {
      throw overLimit(
        `A value this call reads is an object or an array, and \`allowWholeValues\` is false`,
      );
    }
    if (sizeOf(value, limits.maxValueLength) > limits.maxValueLength) {
      throw overLimit(
        `A value this call reads is longer than \`maxValueLength\` (${limits.maxValueLength} characters of JSON) allows`,
      );
    }
  }

  /**
   * The data of a run that another call reads. Rejects if it failed, or if
   * some of it is still to come, as a stream sends it
   */
  function dataOfRun(run: Run) {
    run.clientData ??= run.outcome.promise.then(
      (data) => readableData(opts.transformer.output, data),
      () => {
        throw sourceFailed();
      },
    );
    return run.clientData;
  }
  /** What runs read of each run, by path: each value is read once */
  const valuesOfRuns = new WeakMap<Run, Map<string, Promise<unknown>>>();
  /**
   * The value at `path` of the run at `indexes` of a call that `source` is
   * read by. Rejects as `dataOf` does
   */
  async function valueOf(read: {
    source: Source;
    indexes: readonly number[];
    path: PipelinePath;
  }) {
    const run = await runOf(read.source, read.indexes);
    let values = valuesOfRuns.get(run);
    if (!values) {
      values = new Map();
      valuesOfRuns.set(run, values);
    }
    const key = JSON.stringify(read.path);
    let value = values.get(key);
    if (!value) {
      value = dataOfRun(run).then((data) => readPipelinePath(data, read.path));
      // Read only by the runs that ask for it
      value.catch(() => undefined);
      values.set(key, value);
    }
    return value;
  }
  /**
   * The data that the run at `indexes` of a call reads of `source`: its run
   * at the start of those indexes, as its frame is the start of the call's
   */
  async function dataOf(source: Source, indexes: readonly number[]) {
    return dataOfRun(await runOf(source, indexes));
  }
  /** The run of `source` at the start of `indexes` */
  async function runOf(source: Source, indexes: readonly number[]) {
    let node = await source.runs.promise;
    for (const index of indexes) {
      if (node.kind !== 'items') {
        break;
      }
      // Its runs are at the places of its frame, which these indexes are in.
      // oxlint-disable-next-line typescript/non-nullable-type-assertion-style -- `!` is not allowed either
      node = await (node.items[index] as Places<Run>);
    }
    // A list of it that was refused, or a call that failed as a whole, has
    // no run to read
    if (node.kind !== 'run') {
      throw sourceFailed();
    }
    return node.value;
  }

  /** The places of each frame, by what the frame is */
  const placesOfFrames = new Map<string, Places<Place>>();
  /** The key of each frame: the id of its parent's key, and its own level */
  const keysOfFrames = new WeakMap<PipelineFrame<Source>, string>();
  const idsOfKeys = new Map<string, number>();
  /**
   * What a frame is, as a key: two frames of the same lists have the same.
   * Each level's key holds its parent's as a short id, so keys take as much
   * as the path does, and a loop makes them: a list can have more levels than
   * a stack has room for
   */
  function keyOf(frame: PipelineFrame<Source>): string {
    // The frame and the levels it is in that have no key yet, outermost last
    const levels: PipelineFrame<Source>[] = [];
    let key = '';
    for (let at: PipelineFrame<Source> | null = frame; at; at = at.parent) {
      const known = keysOfFrames.get(at);
      if (known !== undefined) {
        key = known;
        break;
      }
      levels.push(at);
    }
    for (const level of levels.reverse()) {
      let parent = idsOfKeys.get(key);
      if (parent === undefined) {
        parent = idsOfKeys.size;
        idsOfKeys.set(key, parent);
      }
      key = `${parent}/${level.list.from.index}:${JSON.stringify(level.list.path)}`;
      keysOfFrames.set(level, key);
    }
    return key;
  }
  /** Where the runs of one level are, as its list in each place before is ready */
  function placesOfLevel(
    frame: PipelineFrame<Source>,
    before: Places<Place>,
  ): Places<Place> {
    const { list, inItem } = frame;
    return mapPlaces(before, async (place): Promise<PlacesNode<Place>> => {
      try {
        const items = inItem
          ? // A level after the first: its list is in the item of the one
            // before
            readPipelinePath(place.item, inItem)
          : readPipelinePath(await dataOf(list.from, place.indexes), list.path);
        return itemsOf({ list: items, indexes: place.indexes, tooLong });
      } catch (cause) {
        // The run the list is in failed, or the list can't be read: none
        // of its items run, and other lists are as they are
        return { kind: 'failed', error: getTRPCErrorFromUnknown(cause) };
      }
    });
  }
  /**
   * Where the runs of a frame are, as the lists it is made of are ready. In a
   * loop, from the outermost level that has none yet
   */
  function placesOf(frame: PipelineFrame<Source>): Places<Place> {
    const levels: PipelineFrame<Source>[] = [];
    let places: Places<Place> | undefined;
    let at: PipelineFrame<Source> | null = frame;
    while (at) {
      places = placesOfFrames.get(keyOf(at));
      if (places) {
        break;
      }
      levels.push(at);
      at = at.parent;
    }
    places ??= Promise.resolve<PlacesNode<Place>>({
      kind: 'run',
      value: { indexes: [], item: null },
    });
    for (const level of levels.reverse()) {
      places = placesOfLevel(level, places);
      placesOfFrames.set(keyOf(level), places);
    }
    return places;
  }

  /**
   * A filled-in input as a call gets it when a client fills it in and sends
   * it: through the transformer of inputs, all of it, so what is not there
   * is `null` in a list and left out of an object where JSON makes it so. It
   * is a value of its own too, so a call that changes its input in place
   * changes nothing that another call, or another run, reads.
   */
  function asSent(input: unknown) {
    return overTheWire(opts.transformer.input, input);
  }
  /**
   * The runs of the batch. Each call holds a place from the start; a call for
   * every item changes its own to one for each item, and a call that doesn't
   * run gives its places back.
   */
  let runs = opts.calls.length;
  /**
   * Changes the places a call holds from `held` to `count`. Throws if the
   * batch would then have too many runs, and changes nothing then. Nothing
   * waits in it, so calls can't go over together.
   */
  function holdRuns(held: number, count: number) {
    const taken = runs - held + count;
    if (opts.maxRuns !== null && taken > opts.maxRuns) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `A call for every item exceeds the maximum batch size`,
      });
    }
    if (taken > limits.maxRuns) {
      throw overLimit(
        `This call would make the batch run ${taken} times, more than \`maxRuns\` (${limits.maxRuns}) allows`,
      );
    }
    runs = taken;
  }

  /**
   * Why a list can't run, if it is too long for any call to hold a place for
   * each of its items, whatever else the batch has
   */
  function tooLong(length: number) {
    if (opts.maxRuns !== null && length > opts.maxRuns) {
      return new TRPCError({
        code: 'BAD_REQUEST',
        message: `A call for every item exceeds the maximum batch size`,
      });
    }
    return length > limits.maxRuns
      ? overLimit(
          `A list has ${length} items, more than \`maxRuns\` (${limits.maxRuns}) allows`,
        )
      : null;
  }

  let filledSize = 0;
  /**
   * The input of a run: the call's own, with what it reads written in. It
   * takes what it fills in from what the batch may fill in only once the
   * input is made: a run whose input can't be made takes none. Nothing waits
   * between counting and taking, so runs that fill in at the same time can't
   * go over together.
   */
  async function fill(run: {
    /** The call's input as the client sent it */
    base: unknown;
    reads: PipelineCallReads<Source>;
    place: Place;
    /**
     * Whether the call runs for every item. Each run's whole input counts
     * then, as each is a copy. Otherwise only the values it reads do: the
     * rest is what the client sent
     */
    perItem: boolean;
  }) {
    const values = await Promise.all(
      // Async: a read that throws is a rejection, so every read is waited for
      run.reads.reads.map(async (read) =>
        read.kind === 'whole'
          ? valueOf({
              source: read.from,
              indexes: run.place.indexes,
              path: read.path,
            })
          : readPipelinePath(run.place.item, read.path),
      ),
    );
    let size = 0;
    const count = (value: unknown) => {
      size += sizeOf(value, limits.maxFillSize - filledSize - size);
      if (filledSize + size > limits.maxFillSize) {
        throw overLimit(
          `What this call fills in goes over \`maxFillSize\` (${limits.maxFillSize} characters of JSON for the batch)`,
        );
      }
    };
    let input = run.base;
    for (const [at, read] of run.reads.reads.entries()) {
      const value = values[at];
      checkValue(value);
      if (!run.perItem) {
        count(value);
      }
      input = writePipelinePath({ input, to: read.to, value });
    }
    input = asSent(input);
    if (run.perItem) {
      // All of it, with the keys its values are written under
      count(input);
    }
    filledSize += size;
    return input;
  }

  /** A call that runs once for every item of its frame */
  function perItem(each: {
    call: TCall;
    source: Source;
    frame: PipelineFrame<Source>;
    reads: PipelineCallReads<Source>;
  }): PipelineEach {
    const { call, source, frame, reads } = each;
    const refusal = refusalOf(source, reads);
    return async function runEach<TError>(run: {
      item: (input: unknown) => Promise<unknown>;
      error: (cause: unknown, input: unknown) => TError;
    }): PipelineRuns<TError> {
      const { error } = run;
      source.started = true;
      let base: unknown;
      try {
        if (refusal) {
          throw refusal;
        }
        base = await call.getRawInput();
      } catch (cause) {
        // Refused, or its own input can't be read: it runs for no item, and
        // gives back the place it holds
        runs -= 1;
        throw cause;
      }
      /** Whether it still holds the place it held from the start */
      let placeholder = true;
      const release = () => {
        if (placeholder) {
          placeholder = false;
          runs -= 1;
        }
      };
      interface Ran {
        run: Run;
        envelope: Promise<PipelineItemEnvelope<TError>>;
      }
      const start = (place: Place): Ran => {
        const ran = newRun();
        const envelope = (async (): Promise<PipelineItemEnvelope<TError>> => {
          let input: unknown;
          try {
            input = await fill({ base, reads, place, perItem: true });
          } catch (cause) {
            // It doesn't run, and gives back its place
            runs -= 1;
            ran.outcome.reject(cause);
            return { error: error(cause, base) };
          }
          try {
            const data = await run.item(input);
            ran.outcome.resolve(data);
            return { result: { data } };
          } catch (cause) {
            ran.outcome.reject(cause);
            return { error: error(cause, input) };
          }
        })();
        return { run: ran, envelope };
      };
      const walk = (places: Places<Place>, level: number): Places<Ran> =>
        places.then((node): PlacesNode<Ran> => {
          switch (node.kind) {
            case 'failed':
              release();
              return node;
            case 'items':
              // Its items are its runs: it holds a place for each
              if (level + 1 === frame.depth) {
                try {
                  holdRuns(placeholder ? 1 : 0, node.items.length);
                  placeholder = false;
                } catch (cause) {
                  release();
                  return {
                    kind: 'failed',
                    error: getTRPCErrorFromUnknown(cause),
                  };
                }
              } else {
                release();
              }
              return {
                kind: 'items',
                items: node.items.map((item) => walk(item, level + 1)),
              };
            case 'run':
              return { kind: 'run', value: start(node.value) };
          }
        });
      const ran = walk(placesOf(frame), 0);
      void mapPlaces(ran, (it) => ({ kind: 'run', value: it.run })).then(
        source.runs.resolve,
      );
      type Response = Awaited<PipelineRuns<TError>>;
      const response = (places: Places<Ran>): PipelineRuns<TError> =>
        places.then((node): Response | Promise<Response> => {
          switch (node.kind) {
            case 'run':
              return node.value.envelope;
            case 'items':
              return { items: node.items.map(response) };
            case 'failed':
              return { error: error(node.error, base) };
          }
        });
      return response(ran);
    };
  }

  /** A call with its input filled in when it is read, or its runs per item */
  function pipelined(
    call: TCall,
    source: Source,
    reads: PipelineCallReads<Source> | undefined,
  ): { call: TCall; run: PipelineCallRun | null } {
    if (!reads) {
      return { call, run: null };
    }
    const { frame } = source;
    if (frame) {
      return {
        call,
        run: { kind: 'each', each: perItem({ call, source, frame, reads }) },
      };
    }
    const refusal = refusalOf(source, reads);
    let reading: Promise<unknown> | null = null;
    let read: [input: unknown] | null = null;
    const fillOnce = async () => {
      source.started = true;
      try {
        if (refusal) {
          throw refusal;
        }
        const input = await fill({
          base: await call.getRawInput(),
          reads,
          place: { indexes: [], item: null },
          perItem: false,
        });
        read = [input];
        return input;
      } catch (cause) {
        // Refused, or its input can't be made: it doesn't run, and gives back
        // its place among the runs
        runs -= 1;
        throw cause;
      }
    };
    const getRawInput = () => (reading ??= fillOnce());
    return {
      call: {
        ...call,
        getRawInput,
        result: () => (read ? read[0] : call.result()),
      },
      run: { kind: 'once', input: getRawInput },
    };
  }
  const calls = sent.map((it, index) => {
    // A call that runs once has one run, which its outcome settles
    const once = it.source.frame ? null : newRun();
    if (once) {
      it.source.runs.resolve({ kind: 'run', value: once });
    }
    return {
      ...pipelined(it.call, it.source, plan.get(index)),
      once,
      source: it.source,
    };
  });

  return {
    /** The calls, with inputs that are filled in when they are read */
    calls: calls.map((it) => it.call),
    /**
     * Runs every call, and tells the calls that read a call's data how it
     * went. A call that reads values gets how it runs, which is `null` for
     * one that reads none.
     */
    run: <TResult>(run: {
      call: (call: TCall, run: PipelineCallRun | null) => Promise<TResult>;
      /** A call's data, from what `call` gave. Throws if it has none to read */
      data: (result: TResult) => unknown;
    }): Promise<TResult>[] =>
      calls.map((it) => {
        const result = run.call(it.call, it.run);
        result.then(run.data).then(
          (data) => it.once?.outcome.resolve(data),
          (cause: unknown) => {
            it.once?.outcome.reject(cause);
            // A call for every item that failed as a whole has no runs
            it.source.runs.resolve({ kind: 'failed', error: sourceFailed() });
            // It failed before it began to read, such as for a procedure that
            // isn't there: its procedure didn't run
            if (it.run && !it.source.started) {
              runs -= 1;
            }
          },
        );
        return result;
      }),
  };
}
