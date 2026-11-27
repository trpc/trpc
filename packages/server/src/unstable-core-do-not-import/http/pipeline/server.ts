import { getTRPCErrorFromUnknown, TRPCError } from '../../error/TRPCError';
import { isPromise } from '../../stream/jsonl';
import { createDeferred } from '../../stream/utils/createDeferred';
import type { Deferred } from '../../stream/utils/createDeferred';
import type { CombinedDataTransformer } from '../../transformer';
import { isAsyncIterable, isObject } from '../../utils';
import type {
  experimental_PipelineEvent,
  experimental_PipelinePolicy,
  experimental_PipelineVerdict,
} from './policy';
import {
  experimental_pipelineBudget,
  experimental_TRPCPipelineRefusal,
} from './policy';
import type {
  PipelineCallReads,
  PipelineErrorEnvelope,
  PipelineErrorMark,
  PipelineFrame,
  PipelineList,
  PipelinePath,
} from './wire';
import {
  pipelineErrorEnvelope,
  pipelineFrameOf,
  readPipelinePath,
} from './wire';

/**
 * The policy a handler's `experimental_allowPipelining` sets, or `null` if it
 * doesn't accept pipelined batches
 */
export function pipelinePolicyOf(
  option: boolean | experimental_PipelinePolicy | undefined,
): experimental_PipelinePolicy | null {
  if (!option) {
    return null;
  }
  return option === true ? experimental_pipelineBudget() : option;
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
    const replacement: PropertyDescriptor = {
      value: write(
        Object.prototype.hasOwnProperty.call(target, key)
          ? (target as Record<string, unknown>)[key]
          : undefined,
        depth + 1,
      ),
      writable: true,
      enumerable: true,
      configurable: true,
    };
    if (Array.isArray(target)) {
      const copy = [...target];
      Object.defineProperty(copy, key, replacement);
      return copy;
    }
    const descriptors = Object.getOwnPropertyDescriptors(target);
    // In place of its own, where it is, rather than over it once copied: a
    // frozen input's can't be redefined. Not an assignment, which would set
    // the prototype for a `__proto__` key
    Object.defineProperty(descriptors, key, {
      value: replacement,
      writable: true,
      enumerable: true,
      configurable: true,
    });
    // With its prototype: an input's transformer can make it a class instance
    return Object.create(Object.getPrototypeOf(target), descriptors) as object;
  };
  return write(opts.input, 0);
}

/**
 * A value as it is after a trip over the wire. What JSON can't carry is left
 * out. `measure` is told how long its JSON is before it is read back, and
 * throws to read none of it
 */
function overTheWire(
  transformer: CombinedDataTransformer['input' | 'output'],
  value: unknown,
  measure: (length: number) => void,
) {
  const json = JSON.stringify(transformer.serialize(value));
  measure(json === undefined ? 0 : json.length);
  return json === undefined
    ? undefined
    : transformer.deserialize(JSON.parse(json));
}

/**
 * The errors the server made in place of a call, a run or a list that reads a
 * failed one, which the server marks `source-failed`. Never one a procedure
 * threw, whatever its code
 */
const sourceFailedErrors = new WeakSet<TRPCError>();

/** What a call that reads a failed call gets */
function sourceFailed() {
  const error = new TRPCError({
    code: 'PRECONDITION_FAILED',
    message: `The call this call reads its input from failed`,
  });
  sourceFailedErrors.add(error);
  return error;
}

/**
 * An error of its own, from what a read that many runs or calls share threw,
 * for each that the read fails. A `TRPCError` it threw is copied, with its
 * code, message, cause and stack: each that gets one, such as in `onError`,
 * can change it
 */
function errorOfOwn(cause: unknown) {
  const error = getTRPCErrorFromUnknown(cause);
  if (error !== cause) {
    return error;
  }
  const copy = new TRPCError({
    code: error.code,
    message: error.message,
    cause: error.cause,
  });
  copy.stack = error.stack;
  return copy;
}

/** What a call that reads data that is still to come gets */
function stillToComeUnreadable() {
  return new TRPCError({
    code: 'UNSUPPORTED_MEDIA_TYPE',
    message: 'Cannot read the data of a stream-like response',
  });
}

/**
 * How a read that many runs or calls share went, settled once. A failure is
 * how to make its error, so each run or call that read it fails with an error
 * of its own, not one that another one shares
 */
type Read<TValue> =
  | { ok: true; value: TValue }
  | { ok: false; error: () => TRPCError };

/** Thrown inside `readableData` for a part of the data that is still to come */
class StillToCome extends Error {}

/**
 * A call's data as the client gets it, for the calls that read it. Not if
 * some of it is still to come, as a stream sends it: what JSON makes of that
 * is `{}`, which isn't what the client gets. Data that can't go over the wire
 * at all fails the call itself, so what reads it gets what it gets for a
 * failed call.
 */
function readableData(
  transformer: CombinedDataTransformer['output'],
  data: RunData,
): Read<unknown> {
  try {
    const json =
      data.kind === 'json'
        ? data.json
        : JSON.stringify(
            transformer.serialize(data.value),
            (_key, value: unknown) => {
              if (isPromise(value) || isAsyncIterable(value)) {
                throw new StillToCome();
              }
              return value;
            },
          );
    return {
      ok: true,
      value:
        json === undefined
          ? undefined
          : transformer.deserialize(JSON.parse(json)),
    };
  } catch (cause) {
    return {
      ok: false,
      error:
        cause instanceof StillToCome ? stillToComeUnreadable : sourceFailed,
    };
  }
}

/**
 * The data of a run, for the calls that read it: as it was made, or as the
 * JSON the output transformer made of it that the response sends, which is
 * read without serializing it again
 */
type RunData =
  | { kind: 'value'; value: unknown }
  | { kind: 'json'; json: string | undefined };

/**
 * A call's input as the client sent it: the JSON text of it, taken where the
 * request is read, before the transformer of inputs reads any of it. Text, so
 * nothing that reads or decodes the input can change it.
 */
export interface PipelineSentInput {
  readonly kind: 'sent';
  readonly json: string | undefined;
}

/** A call's input as the transformer of inputs read it, once */
export interface PipelineDecodedInput {
  readonly kind: 'decoded';
  readonly value: unknown;
}

/** A call's input, as a pipelined batch's request is read: both, apart */
export interface PipelineCallInput {
  readonly sent: PipelineSentInput;
  readonly decoded: PipelineDecodedInput;
}

/**
 * A call's input as the client sent it, from the request's JSON. Only where
 * the request is read, before anything decodes it: a transformer can decode
 * an input in place
 */
export function pipelineSentInput(json: unknown): PipelineSentInput {
  return Object.freeze({ kind: 'sent', json: JSON.stringify(json) });
}

/** A call's input as the transformer of inputs read it */
export function pipelineDecodedInput(value: unknown): PipelineDecodedInput {
  return Object.freeze({ kind: 'decoded', value });
}

/**
 * A call refused as its input doesn't come back through the transformer of
 * inputs as the client sent it: see `comesBackAsSent`
 */
function cannotSendAsTheClient() {
  return new experimental_TRPCPipelineRefusal({
    reason: 'transformer',
    message: `This call's input doesn't come back through the input transformer as the client sent it, so the server can't fill it in`,
  });
}

/**
 * A call refused as a value it reads, decoded by itself from the JSON it was
 * written as, doesn't go back through the transformer of inputs to that JSON:
 * see `writesBackAs`
 */
function cannotSendValueAsTheClient() {
  return new experimental_TRPCPipelineRefusal({
    reason: 'transformer',
    message: `A value this call reads doesn't come back through the input transformer as it was written, so the server can't fill it in`,
  });
}

/**
 * Whether what the transformer of inputs read from `json` goes back through
 * it to `json`. A transformer can read a string as an instance that it
 * doesn't write back as that string, or read a value by itself other than
 * as it reads it inside an input
 */
function writesBackAs(opts: {
  transformer: CombinedDataTransformer['input'];
  value: unknown;
  json: string | undefined;
}) {
  try {
    return JSON.stringify(opts.transformer.serialize(opts.value)) === opts.json;
  } catch {
    // What JSON can't carry, such as a `BigInt`, wasn't written
    return false;
  }
}

/**
 * Whether a call's input as the server read it goes back through the
 * transformer of inputs to what the client sent. Only then is it, with values
 * written in, what the client would send
 */
function comesBackAsSent(opts: {
  transformer: CombinedDataTransformer['input'];
  input: PipelineCallInput;
}) {
  return writesBackAs({
    transformer: opts.transformer,
    value: opts.input.decoded.value,
    json: opts.input.sent.json,
  });
}

/** What is held of a budget, or why taking from it was refused */
type PipelineTake =
  | { ok: true; lease: PipelineLease }
  | { ok: false; error: TRPCError };

/** What one taking of a budget holds */
interface PipelineLease {
  /** Gives back `count` of what it holds, or what it still holds if less */
  giveBack: (count: number) => void;
  /** Keeps what it holds for good: nothing of it is given back after this */
  keep: () => void;
}

/**
 * What a batch may spend of one of its limits. `take` is the only way to
 * spend it, and a lease the only way to give some back: what is spent is
 * private to it, so a path that doesn't take can't spend, and none gives
 * back more than it took. Nothing waits in it, so what takes at the same
 * time can't go over together.
 */
function createPipelineBudget(opts: {
  limit: number;
  /** The error for taking so much that `total` would be spent */
  refuse: (total: number) => TRPCError;
}) {
  let spent = 0;
  return {
    /** How much is left to take */
    room: () => opts.limit - spent,
    take: (count: number): PipelineTake => {
      const total = spent + count;
      if (total > opts.limit) {
        return { ok: false, error: opts.refuse(total) };
      }
      spent = total;
      let held = count;
      return {
        ok: true,
        lease: {
          giveBack: (back) => {
            const given = Math.min(back, held);
            held -= given;
            spent -= given;
          },
          keep: () => {
            held = 0;
          },
        },
      };
    },
  };
}
type PipelineBudget = ReturnType<typeof createPipelineBudget>;

/** Takes `count` of `budget`, or throws why it can't */
function spend(budget: PipelineBudget, count: number) {
  const taken = budget.take(count);
  if (!taken.ok) {
    throw taken.error;
  }
  return taken.lease;
}

/** A call refused for having more runs than `maxBatchSize` allows */
function overBatchSize(message: string) {
  return new experimental_TRPCPipelineRefusal({
    reason: 'maxBatchSize',
    message,
  });
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
  /** How long `value` is, its `toJSON` already called, as JSON calls it once */
  const sizeOf = (boxed: unknown, room: number): number => {
    const value = unboxed(boxed);
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
  return (value: unknown, room: number) => sizeOf(asJSON(value, ''), room);
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
  if (Array.isArray(value)) {
    // By index, as JSON reads it, whatever its iterator gives, and as long
    // as it was at the start, whatever a getter adds to it
    const length = value.length;
    for (let index = 0; index < length; index++) {
      // A `,` before each but the first
      addSeparators(index === 0 ? 0 : 1);
      if ((over = add(asJSON(value[index], String(index))))) {
        break;
      }
    }
  } else if (Symbol.iterator in value) {
    // What a transformer makes, such as a `Map` or a `Set`
    let index = 0;
    for (const part of value as Iterable<unknown>) {
      // A `,` before each but the first
      addSeparators(index === 0 ? 0 : 1);
      if ((over = add(asJSON(part, String(index++))))) {
        break;
      }
    }
  } else {
    // A property is read once the room is known to have what is before it.
    // The room bounds what JSON writes, not what is read: a property JSON
    // leaves out is read, and counts for nothing
    let first = true;
    for (const key of Object.keys(value)) {
      const part = asJSON((value as Record<string, unknown>)[key], key);
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

/**
 * What JSON writes for `value` at `key`: what its `toJSON` gives, such as a
 * `Date`'s string, if it has one. A function can have one too. JSON calls it
 * with the property's key, the item's index, or `''` at the top, and once:
 * what it gives is written as it is, even if it has a `toJSON` of its own
 */
function asJSON(value: unknown, key: string): unknown {
  if (
    (typeof value === 'object' && value !== null) ||
    typeof value === 'function' ||
    typeof value === 'bigint'
  ) {
    // Read once, as JSON reads it: a getter can give something else each time
    const toJSON: unknown = (value as { toJSON?: unknown }).toJSON;
    if (typeof toJSON === 'function') {
      return Reflect.apply(toJSON, value, [key]) as unknown;
    }
  }
  return value;
}

/** The primitive JSON writes for a boxed one, such as `Object(1)` */
function unboxed(value: unknown): unknown {
  if (value instanceof Number) {
    return Number(value);
  }
  if (value instanceof String) {
    return String(value);
  }
  // The value it holds, as JSON reads it, not what an own `valueOf` gives
  if (value instanceof Boolean) {
    return Boolean.prototype.valueOf.call(value);
  }
  if (value instanceof BigInt) {
    return BigInt.prototype.valueOf.call(value);
  }
  return value;
}

/**
 * Whether JSON leaves a property with this value out of an object, its
 * `toJSON` already called
 */
function leftOut(value: unknown) {
  return (
    value === undefined ||
    typeof value === 'function' ||
    typeof value === 'symbol'
  );
}

/** What the server needs of a batch's call to fill in its input */
export interface PipelineServerCall {
  /** The procedure's path */
  path: string;
  /** The input as the request has it */
  getRawInput: () => Promise<unknown>;
  /** The input, once it has been read */
  result: () => unknown;
}

/**
 * The outcome of one run, as a response has it: what the run's `item` gave,
 * or what `error` made of why it failed, with the server's mark beside it
 */
export type PipelineRunEnvelope<TError, TData> =
  | { result: { data: TData } }
  | PipelineErrorEnvelope<TError>;

/**
 * The runs of a call that runs for every item, as a response has them: by
 * the item's index, one level for each level of lists, down to the outcome
 * of each run. A list that can't run is an `{ error }`, and so is a call
 * none of whose runs ran as the server refused its lists, or what their
 * inputs fill in, for its limits. Each level,
 * and each run, is a promise of its own, ready when it is.
 */
export type PipelineRuns<TError, TData> = Promise<
  PipelineRunEnvelope<TError, TData> | { items: PipelineRuns<TError, TData>[] }
>;

/**
 * Runs a call once for every item of its frame, and gives every run's
 * outcome: what `item` returned, or what `error` made of why it failed. A
 * list that can't run gets what `error` makes of why.
 */
export type PipelineEach = <TError, TData>(run: {
  /** Runs it for one item: what the response has for the run */
  item: (input: unknown) => Promise<TData>;
  /**
   * The run's data, for the calls that read it, from what `item` gave: the
   * JSON the output transformer made of it, as the response sends it.
   * `undefined` for what JSON writes nothing for
   */
  read: (result: TData) => string | undefined;
  /**
   * The error shape the response has for a run that failed, for a list that
   * can't run, or for a call refused as a whole. The server puts its mark
   * beside it, in the envelope, so nothing `error` makes can add or drop one
   */
  error: (failure: { cause: unknown; input: unknown }) => TError;
}) => PipelineRuns<TError, TData>;

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
 * items. Each is ready when it is, and none rejects.
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
  const { length } = list;
  const error = opts.tooLong(length);
  if (error) {
    return { kind: 'failed', error };
  }
  // By index, up to the length that was checked: a list with holes has a run
  // for each of them too, and a `keys` of the list's own isn't asked
  return {
    kind: 'items',
    items: Array.from({ length }, (_, index) =>
      Promise.resolve<PlacesNode<Place>>({
        kind: 'run',
        value: { indexes: [...opts.indexes, index], item: list[index] },
      }),
    ),
  };
}

/** Thrown inside a read of a value to stop reading one that is refused */
class Refused extends Error {
  readonly refusal: () => TRPCError;
  constructor(refusal: () => TRPCError) {
    super();
    this.refusal = refusal;
  }
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
   * A call's input by the call's index, as the request was read: as the
   * client sent it, and as the transformer read it
   */
  inputOf: (index: number) => Promise<PipelineCallInput>;
  /**
   * The most runs of a call the batch may have: the server's `maxBatchSize`.
   * A call for every item runs once for each item. Of two such calls that
   * are over it together, the one whose list is ready first runs.
   */
  maxRuns: number;
  /** What the server's policy says of each event of the batch */
  allow: (event: experimental_PipelineEvent) => experimental_PipelineVerdict;
}) {
  /** How a run went, settled once: its data, or that it has none to read */
  type RunOutcome = { ok: true; data: RunData } | { ok: false };
  /** A run of a call, as the calls that read it see it */
  interface Run {
    outcome: Deferred<RunOutcome>;
    /** Its data as the client gets it, which is what a path refers to */
    clientData: Promise<Read<unknown>> | null;
  }
  /** A call, as the calls that read its data see it */
  interface Source {
    index: number;
    /** The procedure's path */
    path: string;
    /** Its place in its chain of reads: 1 for a call that reads none */
    depth: number;
    /** The items it runs for, or `null` if it runs once */
    frame: PipelineFrame<Source> | null;
    /** Its runs, at the places of its frame */
    runs: Deferred<PlacesNode<Run>>;
    /** Whether what it reads runs for the items of different lists */
    framesDiffer: boolean;
    /**
     * The place it holds among the batch's runs from the start. A call that
     * doesn't run gives it back. A call for every item holds none: it takes
     * one for each item once its list is ready, so a list that isn't ready
     * yet takes nothing from one that is
     */
    seat: PipelineLease;
  }
  /**
   * The runs of the batch: each call that runs once holds a place from the
   * start, and a call for every item one for each of its items once its list
   * is ready. A call that doesn't run gives its places back.
   */
  const runs = createPipelineBudget({
    limit: opts.maxRuns,
    refuse: (total) =>
      overBatchSize(
        `This call would make the batch run ${total} times, more than \`maxBatchSize\` (${opts.maxRuns}) allows`,
      ),
  });
  /**
   * What the policy says of an event: `null` if it allows it, else what
   * makes the error of its refusal, a new one for each that gets it. What
   * the policy throws is the error of what the event is of, as a procedure's
   * own error is: a client doesn't ask for it again
   */
  function refusalBy(
    event: experimental_PipelineEvent,
  ): (() => TRPCError) | null {
    let verdict: experimental_PipelineVerdict;
    try {
      verdict = opts.allow(event);
    } catch (cause) {
      return () => errorOfOwn(cause);
    }
    return verdict === true
      ? null
      : () => new experimental_TRPCPipelineRefusal(verdict);
  }
  /**
   * The errors of calls refused for going over a limit before any of their
   * runs ran, as the call's outcome: see `markOf`
   */
  const refusedBeforeRunning = new WeakSet<TRPCError>();
  /** Notes why a call doesn't run, before any of its runs ran */
  const notRunBecause = (cause: unknown) => {
    if (cause instanceof experimental_TRPCPipelineRefusal) {
      refusedBeforeRunning.add(cause);
    }
  };
  const newRun = (): Run => ({
    outcome: createDeferred<RunOutcome>(),
    clientData: null,
  });
  const sent = opts.calls.map((call, index) => {
    const source: Source = {
      index,
      path: call.path,
      depth: 1,
      frame: null,
      runs: createDeferred<PlacesNode<Run>>(),
      framesDiffer: false,
      // A request with more calls than this allows is refused as it is read
      seat: spend(runs, 1),
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
      if (framed.frame) {
        // A call for every item counted as one above, so that a request
        // with more calls than `runs` allows is refused: its runs are its
        // items, which take their places as its list is ready
        source.seat.giveBack(1);
      }
    }
  }
  /** Why a call is refused before it reads anything, if it is */
  function refusalOf(source: Source, reads: PipelineCallReads<Source>) {
    const refusal = refusalBy({
      kind: 'call',
      path: source.path,
      depth: source.depth,
      reads: reads.reads.length,
    });
    if (refusal) {
      return refusal();
    }
    if (source.framesDiffer) {
      return invalidPipe(
        `call ${source.index} reads calls that run for the items of different lists`,
      );
    }
    return null;
  }
  /**
   * A value as a call gets it written into its input: its JSON, serialized
   * once through the transformer of inputs, as a client would send it. The
   * value it was read from isn't read again, so what its getters, its
   * `toJSON` or a proxy give is read once. The input is decoded from it: see
   * `fill`. `undefined` for what JSON writes nothing for. The policy hears of
   * it first, and it is serialized only if the policy reads its length or
   * allows it, so a value refused for being an object isn't serialized
   */
  function asWritten(value: unknown): string | undefined {
    /** Its JSON once it is serialized, or what serializing it threw */
    const written: {
      outcome:
        | { ok: true; json: string | undefined }
        | { ok: false; cause: unknown }
        | null;
    } = { outcome: null };
    const write = () => {
      if (!written.outcome) {
        try {
          written.outcome = {
            ok: true,
            json: JSON.stringify(opts.transformer.input.serialize(value)),
          };
        } catch (cause) {
          written.outcome = { ok: false, cause };
        }
      }
      if (!written.outcome.ok) {
        throw written.outcome.cause;
      }
      return written.outcome.json;
    };
    const refusal = refusalBy({
      kind: 'value',
      whole: typeof value === 'object' && value !== null,
      get length() {
        return lengthOf(write());
      },
    });
    // What JSON can't carry fails each run that reads it, whatever the
    // policy did with what it threw
    if (written.outcome && !written.outcome.ok) {
      throw written.outcome.cause;
    }
    if (refusal) {
      throw new Refused(refusal);
    }
    return write();
  }
  /** How long a value is as it is written: its JSON. Nothing for none */
  const lengthOf = (json: string | undefined) => json?.length ?? 0;
  /**
   * What the transformer of inputs reads from JSON, as it reads a request's
   * input: once for each JSON, and what it gives is read by nothing but what
   * it goes into
   */
  function decoded(json: string | undefined): unknown {
    return json === undefined
      ? undefined
      : opts.transformer.input.deserialize(JSON.parse(json));
  }
  /**
   * The value at `path` in `data`, for a call to read, as it is written: see
   * `asWritten`
   */
  function readValue(
    data: unknown,
    path: PipelinePath,
  ): Read<string | undefined> {
    try {
      return {
        ok: true,
        value: asWritten(readPipelinePath(data, path)),
      };
    } catch (cause) {
      return {
        ok: false,
        // What else throws, such as a getter or what JSON can't carry, fails
        // each run that reads it
        error:
          cause instanceof Refused ? cause.refusal : () => errorOfOwn(cause),
      };
    }
  }

  /**
   * The data of a run that another call reads. Not if it failed, or if some
   * of it is still to come, as a stream sends it
   */
  function dataOfRun(run: Run) {
    run.clientData ??= run.outcome.promise.then((outcome): Read<unknown> =>
      outcome.ok
        ? readableData(opts.transformer.output, outcome.data)
        : { ok: false, error: sourceFailed },
    );
    return run.clientData;
  }
  /** What runs read of each run, by path: each value is read once */
  const valuesOfRuns = new WeakMap<
    Run,
    Map<string, Promise<Read<string | undefined>>>
  >();
  /**
   * The value at `path` of the run at `indexes` of a call that `source` is
   * read by. Rejects as `runOf` does
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
      value = dataOfRun(run).then((data) =>
        data.ok ? readValue(data.value, read.path) : data,
      );
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
  /**
   * The run of `source` at the start of `indexes`. Rejects, for each that
   * asks, if it has none to read
   */
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
    /**
     * The items the lists of this level have together. A place is made for
     * each, for a level of a list of lists too, which no call may run for:
     * they count against `maxBatchSize` all the same
     */
    const placed = createPipelineBudget({
      limit: opts.maxRuns,
      refuse: (total) =>
        overBatchSize(
          `The lists at one level have ${total} items together, more than \`maxBatchSize\` (${opts.maxRuns}) allows`,
        ),
    });
    const tooMany = (length: number) => {
      const error =
        tooLong(length) ?? refusalBy({ kind: 'list', length })?.() ?? null;
      if (error) {
        return error;
      }
      const taken = placed.take(length);
      return taken.ok ? null : taken.error;
    };
    /** The list in a place: in its item, or in the data of `list.from` */
    const listIn = async (place: Place) => {
      if (inItem) {
        // A level after the first: its list is in the item of the one before
        return readPipelinePath(place.item, inItem);
      }
      const data = await dataOf(list.from, place.indexes);
      if (!data.ok) {
        throw data.error();
      }
      return readPipelinePath(data.value, list.path);
    };
    return mapPlaces(before, async (place): Promise<PlacesNode<Place>> => {
      try {
        return itemsOf({
          list: await listIn(place),
          indexes: place.indexes,
          tooLong: tooMany,
        });
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
   * A call's input as the request was read, for the server to fill in.
   * Refused if what the server read isn't what the client would send: what
   * is filled in is written into it, and it goes to the call as the client
   * would send it filled in
   */
  async function inputToFill(source: Source) {
    const input = await opts.inputOf(source.index);
    if (!comesBackAsSent({ transformer: opts.transformer.input, input })) {
      throw cannotSendAsTheClient();
    }
    return input;
  }

  /**
   * Why a list can't run, if it is too long for any call to hold a place for
   * each of its items, whatever else the batch has
   */
  function tooLong(length: number) {
    return length > opts.maxRuns
      ? overBatchSize(
          `A list has ${length} items, more than \`maxBatchSize\` (${opts.maxRuns}) allows`,
        )
      : null;
  }

  /**
   * The input of a run: the call's own, with what it reads written in. The
   * policy hears how much it fills in once the input is made: of a run whose
   * input can't be made, it hears nothing.
   */
  async function fill(run: {
    /** The procedure's path */
    path: string;
    /** The call's input, as the client sent it and as it was read */
    base: PipelineCallInput;
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
      // Each read fails this run by itself, with an error of its own
      run.reads.reads.map(async (read) => {
        const value =
          read.kind === 'whole'
            ? await valueOf({
                source: read.from,
                indexes: run.place.indexes,
                path: read.path,
              })
            : readValue(run.place.item, read.path);
        if (!value.ok) {
          throw value.error();
        }
        return value.value;
      }),
    );
    // What the client sent, and each value, decoded from its JSON once:
    // nothing decoded is measured
    let input = decoded(run.base.sent.json);
    let read = 0;
    for (const [at, it] of run.reads.reads.entries()) {
      const json = values[at];
      read += lengthOf(json);
      const value = decoded(json);
      // Written into the input, it is decoded again with the rest of it: as
      // a client sends it only if it comes back as it was written
      if (
        json !== undefined &&
        !writesBackAs({ transformer: opts.transformer.input, value, json })
      ) {
        throw cannotSendValueAsTheClient();
      }
      input = writePipelinePath({ input, to: it.to, value });
    }
    // The input as a client sends it filled in: serialized once, all of it,
    // so what is not there is `null` in a list and left out of an object
    // where JSON makes it so, and decoded once from that, as any request's
    // input is. It is a value of its own too, so a call that changes its
    // input in place changes nothing that another call, or another run,
    // reads. A run for every item fills in all of it, with the keys its
    // values are written under. A call that runs once fills in its values,
    // or what its input grew by if that is more
    const sent = lengthOf(run.base.sent.json);
    input = overTheWire(opts.transformer.input, input, (length) => {
      const refusal = refusalBy({
        kind: 'run',
        path: run.path,
        filled: run.perItem ? length : Math.max(read, length - sent),
      });
      if (refusal) {
        throw refusal();
      }
    });
    return input;
  }

  /** A call that runs once for every item of its frame */
  function perItem(each: {
    source: Source;
    frame: PipelineFrame<Source>;
    reads: PipelineCallReads<Source>;
  }): PipelineEach {
    const { source, frame, reads } = each;
    const refusal = refusalOf(source, reads);
    return async function runEach<TError, TData>(run: {
      item: (input: unknown) => Promise<TData>;
      read: (result: TData) => string | undefined;
      error: (failure: { cause: unknown; input: unknown }) => TError;
    }): PipelineRuns<TError, TData> {
      /**
       * The envelope of an error, marked `source-failed` if it is the one the
       * server made in place of what reads a failed call or run
       */
      const failedWith = (cause: unknown, input: unknown) =>
        pipelineErrorEnvelope(
          run.error({ cause, input }),
          cause instanceof TRPCError && sourceFailedErrors.has(cause)
            ? 'source-failed'
            : null,
        );
      let base: PipelineCallInput;
      try {
        if (refusal) {
          throw refusal;
        }
        base = await inputToFill(source);
      } catch (cause) {
        // Refused, or its own input can't be read: it runs for no item
        notRunBecause(cause);
        throw cause;
      }
      /**
       * How a run ends: its envelope, or why it didn't call the procedure,
       * which `error` makes an envelope of only if the response has its runs
       */
      type RunEnd =
        | { kind: 'ran'; envelope: PipelineRunEnvelope<TError, TData> }
        | { kind: 'notCalled'; cause: unknown };
      interface Ran {
        run: Run;
        end: Promise<RunEnd>;
        /**
         * Why it didn't call the procedure, once its input is made or can't
         * be: none if it did
         */
        notCalled: Promise<unknown[]>;
      }
      /**
       * Whether it is known that the call isn't refused as a whole: a run
       * called the procedure, or a list or a run failed for what isn't a
       * limit. Its runs are the response from then
       */
      let ruledOut = false;
      const onRuledOut = createDeferred<void>();
      const ruleOut = () => {
        ruledOut = true;
        onRuledOut.resolve();
      };
      /** Notes why a list or a run of it can't run */
      const noteFailure = (cause: unknown) => {
        if (!(cause instanceof experimental_TRPCPipelineRefusal)) {
          ruleOut();
        }
      };
      /** A run, which holds a place of `lease` */
      const start = (place: Place, lease: PipelineLease): Ran => {
        const ran = newRun();
        const notCalled = createDeferred<unknown[]>();
        const end = (async (): Promise<RunEnd> => {
          let input: unknown;
          try {
            input = await fill({
              path: source.path,
              base,
              reads,
              place,
              perItem: true,
            });
          } catch (cause) {
            // It doesn't run, and gives back its place
            lease.giveBack(1);
            ran.outcome.resolve({ ok: false });
            notCalled.resolve([cause]);
            noteFailure(cause);
            return { kind: 'notCalled', cause };
          }
          ruleOut();
          notCalled.resolve([]);
          try {
            const data = await run.item(input);
            ran.outcome.resolve({
              ok: true,
              data: { kind: 'json', json: run.read(data) },
            });
            return { kind: 'ran', envelope: { result: { data } } };
          } catch (cause) {
            ran.outcome.resolve({ ok: false });
            // The procedure's own error, which has no mark
            return {
              kind: 'ran',
              envelope: pipelineErrorEnvelope(
                run.error({ cause, input }),
                null,
              ),
            };
          }
        })();
        return { run: ran, end, notCalled: notCalled.promise };
      };
      /**
       * Its runs, level by level. `lease` is what the runs below hold: the
       * places it takes for the items of a list at its last level
       */
      const walk = (
        places: Places<Place>,
        level: number,
        lease: PipelineLease,
      ): Places<Ran> =>
        places.then((node): PlacesNode<Ran> => {
          switch (node.kind) {
            case 'failed':
              return node;
            case 'items': {
              if (level + 1 < frame.depth) {
                return {
                  kind: 'items',
                  items: node.items.map((item) => walk(item, level + 1, lease)),
                };
              }
              // Its items are its runs: it holds a place for each
              const taken = runs.take(node.items.length);
              if (!taken.ok) {
                return { kind: 'failed', error: taken.error };
              }
              return {
                kind: 'items',
                items: node.items.map((item) =>
                  walk(item, level + 1, taken.lease),
                ),
              };
            }
            case 'run':
              return { kind: 'run', value: start(node.value, lease) };
          }
        });
      const ran = walk(placesOf(frame), 0, source.seat);
      void mapPlaces(ran, (it) => ({ kind: 'run', value: it.run })).then(
        source.runs.resolve,
      );
      type Response = Awaited<PipelineRuns<TError, TData>>;
      const response = (places: Places<Ran>): PipelineRuns<TError, TData> =>
        places.then((node): Response | Promise<Response> => {
          switch (node.kind) {
            case 'run':
              return node.value.end.then((end) =>
                end.kind === 'ran'
                  ? end.envelope
                  : failedWith(end.cause, base.decoded.value),
              );
            case 'items':
              return { items: node.items.map(response) };
            case 'failed':
              return failedWith(node.error, base.decoded.value);
          }
        });
      /**
       * Why each list of it that can't run can't, and why each run didn't
       * call the procedure, once every list is ready and every run's input is
       * made or can't be
       */
      const failures = async (places: Places<Ran>): Promise<unknown[]> => {
        const node = await places;
        switch (node.kind) {
          case 'run':
            return node.value.notCalled;
          case 'items':
            return (await Promise.all(node.items.map(failures))).flat();
          case 'failed':
            noteFailure(node.error);
            return [node.error];
        }
      };
      const failed = failures(ran);
      // Once it is known that it isn't refused as a whole, or every run is
      // known not to call the procedure
      await Promise.race([onRuledOut.promise, failed]);
      const refused = ruledOut ? [] : await failed;
      // None of its runs called the procedure, as the server refused its
      // lists, or what their inputs fill in, for its limits: a client can ask
      // for it by itself, as for a call refused as a whole. One with a list
      // or a run that can't run for another reason has been ruled out. One
      // with none refused is as it is
      if (refused.length > 0) {
        return pipelineErrorEnvelope(
          run.error({ cause: refused[0], input: base.decoded.value }),
          'not-run',
        );
      }
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
      // It runs as in any batch, so the place it holds is its own for good
      source.seat.keep();
      return { call, run: null };
    }
    const { frame } = source;
    if (frame) {
      return {
        call,
        run: { kind: 'each', each: perItem({ source, frame, reads }) },
      };
    }
    const refusal = refusalOf(source, reads);
    let reading: Promise<unknown> | null = null;
    let read: [input: unknown] | null = null;
    const fillOnce = async () => {
      try {
        if (refusal) {
          throw refusal;
        }
        const input = await fill({
          path: source.path,
          base: await inputToFill(source),
          reads,
          place: { indexes: [], item: null },
          perItem: false,
        });
        // It runs, so the place it holds is its own for good
        source.seat.keep();
        read = [input];
        return input;
      } catch (cause) {
        // Refused, or its input can't be made: it doesn't run, and gives back
        // its place among the runs
        source.seat.giveBack(1);
        notRunBecause(cause);
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
     * The mark the response puts beside a call's error, in its envelope.
     * `not-run`: the server refused the call, for going over a limit, before
     * any of its runs ran, so a client can ask for it by itself.
     * `source-failed`: the error is the one the server sent in place of a call
     * that reads a failed one, which didn't run, so a client never has to tell
     * it from the procedure's own by its code. `null` for any other error,
     * such as one a procedure threw, whatever its code
     */
    markOf: (error: TRPCError): PipelineErrorMark | null =>
      refusedBeforeRunning.has(error)
        ? 'not-run'
        : sourceFailedErrors.has(error)
          ? 'source-failed'
          : null,
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
        void result.then(run.data).then(
          (data) =>
            it.once?.outcome.resolve({
              ok: true,
              data: { kind: 'value', value: data },
            }),
          () => {
            it.once?.outcome.resolve({ ok: false });
            // A call for every item that failed as a whole has no runs
            it.source.runs.resolve({ kind: 'failed', error: sourceFailed() });
            // One that failed before it began to read, such as for a
            // procedure that isn't there, didn't run: it gives back its place.
            // One that began has given it back, or kept it, already
            it.source.seat.giveBack(1);
          },
        );
        return result;
      }),
  };
}
