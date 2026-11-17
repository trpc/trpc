import { TRPCError } from '../../error/TRPCError';
import { createDeferred } from '../../stream/utils/createDeferred';
import type { CombinedDataTransformer } from '../../transformer';
import { isObject } from '../../utils';
import type {
  PipelineCallReads,
  PipelineItemEnvelope,
  PipelineItemRead,
  PipelinePath,
  PipelineRead,
  PipelineWholeRead,
} from './wire';
import {
  groupPipelineReads,
  pipelineReadsLimit,
  readPipelinePath,
} from './wire';

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
 * call's index. A string is the search param's JSON. Nothing after this
 * checks it again.
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
      if (reads.length > pipelineReadsLimit) {
        throw invalidPipe(
          `call ${key} reads more than ${pipelineReadsLimit} values`,
        );
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
 * Makes the calls of a batch read parts of their input from the data of
 * earlier calls, as its `pipe` says. Throws if the `pipe` is invalid.
 */
export function pipelineCalls<TCall extends PipelineServerCall>(opts: {
  calls: readonly TCall[];
  /** The request's `pipe`, not yet checked */
  pipe: unknown;
  transformer: CombinedDataTransformer;
  /**
   * The most runs of a call the batch may have, or `null` for any number. A
   * call for every item of a list runs once for each item. Of two such calls
   * that are over it together, the one whose list is ready first runs.
   */
  maxRuns: number | null;
}) {
  /** A call, as the calls that read its data see it */
  interface Source {
    /** How the call went: its data, or a rejection if it has none to read */
    outcome: ReturnType<typeof createDeferred<unknown>>;
    /** Its data as the client gets it, which is what a path refers to */
    clientData: Promise<unknown> | null;
  }
  const sent = opts.calls.map((call) => {
    const outcome = createDeferred<unknown>();
    // A failed call that nothing reads from isn't an unhandled rejection
    outcome.promise.catch(() => undefined);
    const source: Source = { outcome, clientData: null };
    return { call, source };
  });
  const plan = parsePipelineReads({
    pipe: opts.pipe,
    sources: sent.map((it) => it.source),
  });

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
   * A value as a call gets it when a client sends it: through the transformer
   * of inputs. It is a value of its own too, so a call that changes its input
   * in place changes nothing that another call, or another run, reads.
   */
  function asSent(value: unknown) {
    return overTheWire(opts.transformer.input, value);
  }
  /** `input` with what `read` reads, which is at its path in `data` */
  function filled(
    input: unknown,
    read: PipelineWholeRead<Source> | PipelineItemRead,
    data: unknown,
  ) {
    return writePipelinePath({
      input,
      to: read.to,
      value: asSent(readPipelinePath(data, read.path)),
    });
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

  /** The inputs of a call that runs once per item of a list */
  async function inputsOfEach(
    call: TCall,
    reads: Extract<PipelineCallReads<Source>, { kind: 'each' }>,
  ) {
    const base = await call.getRawInput();
    const found = readPipelinePath(
      await dataOf(reads.list.from),
      reads.list.path,
    );
    // What is no list has no items
    const items: unknown[] = Array.isArray(found) ? found : [];
    takeRuns(items.length);
    const inputs: unknown[] = [];
    // By index: a list with holes has a run for each of them too
    for (const index of items.keys()) {
      // Every run has an input of its own, as calls the client sends do
      let input = asSent(base);
      for (const read of reads.reads) {
        input = filled(
          input,
          read,
          read.kind === 'item' ? items[index] : await dataOf(read.from),
        );
      }
      inputs.push(input);
    }
    return inputs;
  }

  /** A call with its input filled in when it is read, or its runs per item */
  function pipelined(
    call: TCall,
    reads: PipelineCallReads<Source> | undefined,
  ): { call: TCall; each: PipelineEach | null } {
    if (!reads) {
      return { call, each: null };
    }
    if (reads.kind === 'each') {
      return {
        call,
        each: async (run) => {
          const inputs = await inputsOfEach(call, reads);
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
      };
    }
    let reading: Promise<unknown> | null = null;
    let read: [input: unknown] | null = null;
    const fill = async () => {
      let input = await call.getRawInput();
      for (const value of reads.reads) {
        input = filled(input, value, await dataOf(value.from));
      }
      read = [input];
      return input;
    };
    return {
      call: {
        ...call,
        getRawInput: () => (reading ??= fill()),
        result: () => (read ? read[0] : call.result()),
      },
      each: null,
    };
  }
  const calls = sent.map((it, index) => ({
    ...pipelined(it.call, plan.get(index)),
    outcome: it.source.outcome,
  }));

  return {
    /** The calls, with inputs that are filled in when they are read */
    calls: calls.map((it) => it.call),
    /**
     * Runs every call, and tells the calls that read a call's data how it
     * went. A call that runs once per item of a list gets `each` to run
     * with.
     */
    run: <TResult>(run: {
      call: (call: TCall, each: PipelineEach | null) => Promise<TResult>;
      /** A call's data, from what `call` gave. Throws if it has none to read */
      data: (result: TResult) => unknown;
    }): Promise<TResult>[] =>
      calls.map((it) => {
        const result = run.call(it.call, it.each);
        result.then(run.data).then(it.outcome.resolve, it.outcome.reject);
        return result;
      }),
  };
}
