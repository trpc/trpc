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
}

/**
 * The `pipe` search param of a batch request: the reads of each call, by the
 * call's index.
 */
export type PipelineReads = Record<number, PipelineRead[]>;

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

/** Parses the `pipe` search param of a batch request */
export function parsePipelineReads(opts: {
  pipe: string;
  /** The number of calls in the batch */
  calls: number;
}): Map<number, PipelineRead[]> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(opts.pipe);
  } catch {
    throw invalidPipe('not JSON');
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
      return [
        index,
        reads.map((read: unknown): PipelineRead => {
          if (!isObject(read) || !isKeys(read['to']) || !isPath(read['path'])) {
            throw invalidPipe(`expected "to" and "path" at ${key}`);
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
          return { to: read['to'], from, path: read['path'] };
        }),
      ];
    }),
  );
}

function writePipelinePath(opts: {
  input: unknown;
  to: readonly string[];
  value: unknown;
}): unknown {
  const last = opts.to[opts.to.length - 1];
  if (last === undefined) {
    return opts.value;
  }
  const parent = readPipelinePath(opts.input, opts.to.slice(0, -1));
  if (
    typeof parent !== 'object' ||
    parent === null ||
    (Array.isArray(parent) &&
      !Object.prototype.hasOwnProperty.call(parent, last))
  ) {
    throw invalidPipe(`the input has nothing at "${opts.to.join('.')}"`);
  }
  // Not an assignment, which would set the prototype for a `__proto__` key
  Object.defineProperty(parent, last, {
    value: opts.value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
  return opts.input;
}

/**
 * Makes the calls of a batch read parts of their input from the data of
 * earlier calls. Report every call's outcome with `resolve` or `reject`.
 */
export function pipelineCalls(opts: {
  calls: TRPCRequestInfoProcedureCall[];
  reads: Map<number, PipelineRead[]>;
  transformer: CombinedDataTransformer;
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

  const calls = opts.calls.map((call, index) => {
    const reads = opts.reads.get(index);
    if (!reads) {
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
          value: readPipelinePath(data, read.path),
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
    resolve: (index: number, data: unknown) => {
      outputs[index]?.resolve(data);
    },
    reject: (index: number, error: unknown) => {
      outputs[index]?.reject(error);
    },
  };
}
