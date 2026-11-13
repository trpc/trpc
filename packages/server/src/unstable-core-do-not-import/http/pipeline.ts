import { TRPCError } from '../error/TRPCError';
import { createDeferred } from '../stream/utils/createDeferred';
import type { CombinedDataTransformer } from '../transformer';
import { isObject } from '../utils';
import type { TRPCRequestInfoProcedureCall } from './types';

/**
 * Where a value is in a call's data: the keys to follow. `null` stands for every
 * item of an array, so `['items', null, 'id']` is the list of the items' ids.
 */
export type PipelinePath = (string | null)[];

/**
 * A part of a call's input that the server fills in with the data of an
 * earlier call in the same batch.
 */
export interface PipelineRead {
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
  each: boolean;
}

/**
 * The `pipe` of a pipelined batch, `?batch=pipeline`: the reads of each call, by the
 * call's index. It is in the body of a POST, beside the inputs, and in the
 * `pipe` search param of a GET, which has no body.
 *
 * A server that doesn't accept pipelined batches takes `?batch=pipeline` for a call
 * to one procedure, finds none, and runs nothing.
 */
export type PipelineReads = Record<
  number,
  (Omit<PipelineRead, 'each'> & { each?: true })[]
>;

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

/** Validates the `pipe` of a batch request. A string is the search param's JSON */
export function parsePipelineReads(opts: {
  pipe: unknown;
  /** The number of calls in the batch */
  calls: number;
}): Map<number, PipelineRead[]> {
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
      if (!Number.isInteger(index) || index < 0 || index >= opts.calls) {
        throw invalidPipe(`no call at index ${key}`);
      }
      if (!Array.isArray(reads)) {
        throw invalidPipe(`expected an array at ${key}`);
      }
      const parsedReads = reads.map((read: unknown): PipelineRead => {
        if (!isObject(read) || !isKeys(read['to']) || !isPath(read['path'])) {
          throw invalidPipe(`expected "to" and "path" at ${key}`);
        }
        const each = read['each'] === true;
        if (each && !read['path'].includes(null)) {
          throw invalidPipe(`"each" at ${key} needs a list in its path`);
        }
        const from = read['from'];
        // Only earlier calls, so calls can't wait for each other
        if (
          typeof from !== 'number' ||
          !Number.isInteger(from) ||
          from < 0 ||
          from >= index
        ) {
          throw invalidPipe(`call ${key} can only read from an earlier call`);
        }
        return { to: read['to'], from, path: read['path'], each };
      });
      // A call runs once per item of one list
      const lists = new Set(
        parsedReads
          .filter((read) => read.each)
          .map((read) =>
            JSON.stringify([
              read.from,
              read.path.slice(0, read.path.indexOf(null)),
            ]),
          ),
      );
      if (lists.size > 1) {
        throw invalidPipe(`call ${key} reads each item of more than one list`);
      }
      return [index, parsedReads];
    }),
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
      (Array.isArray(target) &&
        !Object.prototype.hasOwnProperty.call(target, key))
    ) {
      throw invalidPipe(`the input has nothing at "${opts.to.join('.')}"`);
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

/**
 * Makes the calls of a batch read parts of their input from the data of
 * earlier calls. Report every call's outcome with `resolve` or `reject`.
 */
export function pipelineCalls(opts: {
  calls: TRPCRequestInfoProcedureCall[];
  reads: Map<number, PipelineRead[]>;
  transformer: CombinedDataTransformer;
  /**
   * Called with the number of items a call runs for, before it runs for any.
   * Throws if the request may not run that many.
   */
  takeRuns: (count: number) => void;
}) {
  const outputs = opts.calls.map(() => {
    const deferred = createDeferred<unknown>();
    // A failed call that nothing reads from isn't an unhandled rejection
    deferred.promise.catch(() => undefined);
    return deferred;
  });
  /** Each call's data as the client gets it, which is what its paths refer to */
  const clientData = new Map<number, Promise<unknown>>();
  function clientDataOf(index: number) {
    let promise = clientData.get(index);
    if (!promise) {
      promise = Promise.resolve(outputs[index]?.promise).then((data) => {
        const json = JSON.stringify(opts.transformer.output.serialize(data));
        return json === undefined
          ? undefined
          : opts.transformer.output.deserialize(JSON.parse(json));
      });
      clientData.set(index, promise);
    }
    return promise;
  }
  /**
   * The value at `path` in a call's data, as the call that reads it gets it
   * when a client sends it: through the transformer of inputs. It is a value
   * of its own too, so a call that changes its input in place changes nothing
   * that another call reads.
   */
  function valueAt(data: unknown, path: PipelinePath) {
    const value = readPipelinePath(data, path);
    const json =
      value === undefined
        ? undefined
        : JSON.stringify(opts.transformer.input.serialize(value));
    return json === undefined
      ? undefined
      : opts.transformer.input.deserialize(JSON.parse(json));
  }

  /** The inputs of a call that runs once per item of a list */
  async function inputsOfEach(index: number) {
    const call = opts.calls[index];
    const reads = opts.reads.get(index) ?? [];
    const list = reads.find((read) => read.each);
    if (!call || !list) {
      return [];
    }
    const readData = (read: PipelineRead) =>
      clientDataOf(read.from).catch(() => {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: `The call this call reads its input from failed`,
        });
      });
    const base = await call.getRawInput();
    const items = readPipelinePath(
      await readData(list),
      list.path.slice(0, list.path.indexOf(null)),
    );
    const inputs: unknown[] = [];
    if (Array.isArray(items)) {
      opts.takeRuns(items.length);
    }
    for (const item of Array.isArray(items) ? items.keys() : []) {
      let input = base;
      for (const read of reads) {
        input = writePipelinePath({
          input,
          to: read.to,
          value: valueAt(
            await readData(read),
            read.each ? bindPipelinePath(read.path, item) : read.path,
          ),
        });
      }
      inputs.push(input);
    }
    return inputs;
  }

  const calls = opts.calls.map((call, index) => {
    const reads = opts.reads.get(index);
    if (!reads || reads.some((read) => read.each)) {
      return call;
    }
    let filled: Promise<unknown> | null = null;
    let result: [input: unknown] | null = null;
    async function fill() {
      let input = await call.getRawInput();
      for (const read of reads ?? []) {
        const data = await clientDataOf(read.from).catch(() => {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: `The call this call reads its input from failed`,
          });
        });
        input = writePipelinePath({
          input,
          to: read.to,
          value: valueAt(data, read.path),
        });
      }
      result = [input];
      return input;
    }
    return {
      ...call,
      getRawInput: () => (filled ??= fill()),
      result: () => (result ? result[0] : call.result()),
    };
  });

  return {
    calls,
    /**
     * For a call that runs once per item of a list: reads its inputs, one per
     * item. `null` for any other call.
     */
    each: (index: number) =>
      opts.reads.get(index)?.some((read) => read.each)
        ? () => inputsOfEach(index)
        : null,
    resolve: (index: number, data: unknown) => {
      outputs[index]?.resolve(data);
    },
    reject: (index: number, error: unknown) => {
      outputs[index]?.reject(error);
    },
  };
}
