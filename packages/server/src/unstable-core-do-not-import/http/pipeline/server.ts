import { TRPCError } from '../../error/TRPCError';
import { createDeferred } from '../../stream/utils/createDeferred';
import type { CombinedDataTransformer } from '../../transformer';
import { isObject } from '../../utils';
import type { experimental_PipeliningOptions } from '../types';
import type {
  PipelineCallReads,
  PipelineItemEnvelope,
  PipelineLimits,
  PipelinePath,
  PipelineRead,
  PipelineWholeRead,
} from './wire';
import {
  groupPipelineReads,
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
 * A read names its source by index. It comes back as what `sources` has for
 * that call, so a read from a call that isn't there, or isn't earlier, can't
 * come out of this.
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
    Object.entries(parsed).map(([key, reads]) => {
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
      if (!Array.isArray(reads)) {
        throw invalidPipe(`expected an array at ${key}`);
      }
      const grouped = groupPipelineReads(
        reads.map((read: unknown): PipelineRead<TSource> => {
          if (!isObject(read) || !isKeys(read['to']) || !isPath(read['path'])) {
            throw invalidPipe(`expected "to" and "path" at ${key}`);
          }
          const from = read['from'];
          // Only earlier calls, so calls can't wait for each other
          const source =
            typeof from === 'number' && Number.isInteger(from) && from < index
              ? opts.sources[from]
              : undefined;
          if (source === undefined) {
            throw invalidPipe(`call ${key} can only read from an earlier call`);
          }
          return {
            to: read['to'],
            from: source,
            path: read['path'],
            each: read['each'] === true,
          };
        }),
      );
      if (grouped.ok) {
        return [index, grouped.reads];
      }
      switch (grouped.problem) {
        case 'each-without-list':
          throw invalidPipe(`"each" at ${key} needs a list in its path`);
        case 'more-than-one-list':
          // A call runs once per item of one list
          throw invalidPipe(
            `call ${key} reads each item of more than one list`,
          );
      }
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
    let over = false;
    if (Symbol.iterator in value) {
      // An array, or what a transformer makes, such as a `Map` or a `Set`
      let index = 0;
      for (const part of value as Iterable<unknown>) {
        // A `,` before each but the first
        size += index++ === 0 ? 0 : 1;
        if ((over = add(part))) {
          break;
        }
      }
    } else {
      // A property is read once the room is known to have what is before it
      for (const [index, key] of Object.keys(value).entries()) {
        // A `,` before each but the first, and a `:` after its key
        size += (index === 0 ? 0 : 1) + 1;
        if ((over = add(key) || add((value as Record<string, unknown>)[key]))) {
          break;
        }
      }
    }
    if (over) {
      objects.set(value, { size, exact: false });
      return size;
    }
    objects.set(value, { size, exact: true });
    return size;
  };
  return sizeOf;
}

/** What the server needs of a batch's call to fill in its input */
export interface PipelineServerCall {
  /** The input as the client sent it */
  getRawInput: () => Promise<unknown>;
  /** The input, once it has been read */
  result: () => unknown;
}

/**
 * Runs a call once for every item of the list it reads, and gives every
 * item's outcome: what `item` returned, or what `error` made of what it threw.
 */
export type PipelineEach = <TError>(run: {
  item: (input: unknown) => Promise<unknown>;
  error: (cause: unknown, input: unknown) => TError;
}) => Promise<PipelineItemEnvelope<TError>[]>;

/**
 * How a call of a pipelined batch that reads values runs: once, with an input
 * that is filled in before it runs, or once for every item of a list. It runs
 * after its input is filled in even when nothing of it reads its input: a
 * procedure without an input parser is refused, or doesn't run, as any other.
 */
export type PipelineCallRun =
  | { kind: 'once'; input: () => Promise<unknown> }
  | { kind: 'each'; each: PipelineEach };

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
   * call for every item of a list runs once for each item. Of two such calls
   * that are over it together, the one whose list is ready first runs.
   */
  maxRuns: number | null;
  /** What the server lets the batch make it do */
  limits: PipelineLimits;
}) {
  const { limits } = opts;
  const sizeOf = createPipelineSizeOf();
  /** A call, as the calls that read its data see it */
  interface Source {
    /** How the call went: its data, or a rejection if it has none to read */
    outcome: ReturnType<typeof createDeferred<unknown>>;
    /** Its data as the client gets it, which is what a path refers to */
    clientData: Promise<unknown> | null;
    /** Its place in its chain: 1 for a call that reads none */
    depth: number;
  }
  const sent = opts.calls.map((call) => {
    const outcome = createDeferred<unknown>();
    // A failed call that nothing reads from isn't an unhandled rejection
    outcome.promise.catch(() => undefined);
    const source: Source = { outcome, clientData: null, depth: 1 };
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
      if (reads.kind === 'each') {
        from.push(reads.list.from);
      }
      // 1 for a call whose reads are empty, as for one that has none
      source.depth = 1 + Math.max(0, ...from.map((it) => it.depth));
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

  /** The data of a call that another reads. Rejects if that call failed */
  function dataOf(source: Source) {
    source.clientData ??= source.outcome.promise.then((data) =>
      overTheWire(opts.transformer.output, data),
    );
    return source.clientData.catch(() => {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: `The call this call reads its input from failed`,
      });
    });
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
  let runs = opts.calls.length;
  /** Counts the runs of a call for `count` items. Throws if they are too many */
  function takeRuns(count: number) {
    const taken = runs + count - 1;
    if (opts.maxRuns !== null && taken > opts.maxRuns) {
      // A call that is refused runs for no item: it takes none of the limit,
      // not its own place either
      runs -= 1;
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `A call for every item exceeds the maximum batch size`,
      });
    }
    runs = taken;
  }

  let filledSize = 0;
  /**
   * Counts what a call fills in. It takes it from what the batch may fill in
   * only once the call's inputs are made: a call that is refused, or whose
   * inputs can't be made, takes none. Nothing waits between the last `add`
   * and `take`, so calls that fill in at the same time can't go over together.
   */
  function fillCounter() {
    let size = 0;
    return {
      /** Counts a value. Throws if the call fills in more than is left */
      add: (value: unknown) => {
        size += sizeOf(value, limits.maxFillSize - filledSize - size);
        if (filledSize + size > limits.maxFillSize) {
          throw overLimit(
            `What this call fills in goes over \`maxFillSize\` (${limits.maxFillSize} characters of JSON for the batch)`,
          );
        }
      },
      take: () => {
        filledSize += size;
      },
    };
  }

  /** The inputs of a call that runs once per item of a list */
  async function inputsOfEach(
    call: TCall,
    reads: Extract<PipelineCallReads<Source>, { kind: 'each' }>,
    refusal: TRPCError | null,
  ) {
    if (refusal) {
      // It runs for no item: it takes no place among the runs
      runs -= 1;
      throw refusal;
    }
    const base = await call.getRawInput();
    const found = readPipelinePath(
      await dataOf(reads.list.from),
      reads.list.path,
    );
    // What is no list has no items
    const items: unknown[] = Array.isArray(found) ? found : [];
    takeRuns(items.length);
    /** What a value that is the same for every run is */
    const wholes = new Map<PipelineWholeRead<Source>, unknown>();
    const counter = fillCounter();
    const inputs: unknown[] = [];
    try {
      // By index: a list with holes has a run for each of them too
      for (const index of items.keys()) {
        let input = base;
        for (const read of reads.reads) {
          if (read.kind === 'whole' && !wholes.has(read)) {
            const value = readPipelinePath(await dataOf(read.from), read.path);
            checkValue(value);
            wholes.set(read, value);
          }
          let value: unknown;
          if (read.kind === 'item') {
            value = readPipelinePath(items[index], read.path);
            checkValue(value);
          } else {
            value = wholes.get(read);
          }
          input = writePipelinePath({ input, to: read.to, value });
        }
        // Every run has an input of its own, as calls the client sends do.
        // All of it counts, with the keys its values are written under, and
        // before the next is made
        const sent = asSent(input);
        counter.add(sent);
        inputs.push(sent);
      }
      counter.take();
      return inputs;
    } catch (cause) {
      // It runs for no item: it takes none of the runs, not its place either
      runs -= items.length;
      throw cause;
    }
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
    const refusal = refusalOf(source, reads);
    if (reads.kind === 'each') {
      return {
        call,
        run: {
          kind: 'each',
          each: async (run) => {
            const inputs = await inputsOfEach(call, reads, refusal);
            return Promise.all(
              inputs.map(async (input) => {
                try {
                  return { result: { data: await run.item(input) } };
                } catch (cause) {
                  return { error: run.error(cause, input) };
                }
              }),
            );
          },
        },
      };
    }
    let reading: Promise<unknown> | null = null;
    let read: [input: unknown] | null = null;
    const fill = async () => {
      if (refusal) {
        // It doesn't run: it takes no place among the runs
        runs -= 1;
        throw refusal;
      }
      let input = await call.getRawInput();
      const counter = fillCounter();
      try {
        for (const read of reads.reads) {
          const value = readPipelinePath(await dataOf(read.from), read.path);
          checkValue(value);
          counter.add(value);
          input = writePipelinePath({ input, to: read.to, value });
        }
        input = asSent(input);
      } catch (cause) {
        // It doesn't run: it takes no place among the runs
        runs -= 1;
        throw cause;
      }
      counter.take();
      read = [input];
      return input;
    };
    const getRawInput = () => (reading ??= fill());
    return {
      call: {
        ...call,
        getRawInput,
        result: () => (read ? read[0] : call.result()),
      },
      run: { kind: 'once', input: getRawInput },
    };
  }
  const calls = sent.map((it, index) => ({
    ...pipelined(it.call, it.source, plan.get(index)),
    outcome: it.source.outcome,
  }));

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
        result.then(run.data).then(it.outcome.resolve, it.outcome.reject);
        return result;
      }),
  };
}
