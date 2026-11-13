import type {
  PipelinePath,
  PipelineReads,
} from '@trpc/server/unstable-core-do-not-import';
import type { Operation, OperationContext } from '../types';
import type { ContentOptions } from './httpUtils';
import { getBody, getUrl } from './httpUtils';

/**
 * Lets an operation read parts of its input from the data of operations sent
 * before it, on the server. Put one in an operation's context with
 * `pipelineContext()`.
 *
 * A link that pipelines sets `accepted` as it takes the operation, before the
 * call that sent it returns. Operations sent later in the same tick can then
 * read from it.
 */
export interface OperationPipeline {
  /** Whether a link that pipelines took the operation */
  accepted: boolean;
  /** The parts of the input to fill in. Send `undefined` in their place */
  reads: OperationPipelineRead[];
  /**
   * Set when the operation failed without running: an operation it reads from
   * failed, or wasn't in its batch. Send it again with its whole input.
   */
  unresolved: boolean;
}

export interface OperationPipelineRead {
  /** Where the value goes in the input. Empty for the whole input */
  to: string[];
  /** The pipeline of the operation whose data it comes from */
  from: OperationPipeline;
  /** Where the value is in that data. Empty for all of it */
  path: PipelinePath;
  /**
   * Makes the server run the operation once for every item of the array at the
   * first `null` in `path`. Its result is then a list with a `{ result }` or an
   * `{ error }` for every item.
   */
  each?: boolean;
}

const contextKey = '~pipeline';

export function createOperationPipeline(
  reads: OperationPipelineRead[],
): OperationPipeline {
  return { accepted: false, reads, unresolved: false };
}

/** The context to send an operation with, for it to take part in pipelining */
export function pipelineContext(pipeline: OperationPipeline): OperationContext {
  return { [contextKey]: pipeline };
}

export function pipelineOf(
  op: Pick<Operation, 'context'>,
): OperationPipeline | undefined {
  return op.context[contextKey] as OperationPipeline | undefined;
}

/**
 * For a batch with an operation that reads from another: which operations to
 * send, and what the server fills in. `null` for any other batch, which is
 * sent as it is.
 *
 * An operation that reads from one outside the batch can't run, so it isn't
 * sent.
 */
export function planPipelinedBatch<TOp extends Pick<Operation, 'context'>>(
  batchOps: readonly TOp[],
) {
  const sent: TOp[] = [];
  const reads: PipelineReads = {};
  const sentIndexes = new Map<OperationPipeline, number>();
  let pipelined = false;
  /** The index in `sent` of each operation, or `null` if it isn't sent */
  const positions = batchOps.map((op) => {
    const pipeline = pipelineOf(op);
    const opReads = [];
    for (const read of pipeline?.reads ?? []) {
      pipelined = true;
      const from = sentIndexes.get(read.from);
      if (from === undefined) {
        return null;
      }
      opReads.push({
        to: read.to,
        from,
        path: read.path,
        ...(read.each ? { each: true as const } : {}),
      });
    }
    const index = sent.push(op) - 1;
    if (pipeline) {
      sentIndexes.set(pipeline, index);
    }
    if (opReads.length > 0) {
      reads[index] = opReads;
    }
    return index;
  });
  return pipelined ? { sent, positions, reads } : null;
}

export type PipelinedBatchPlan<TOp extends Pick<Operation, 'context'>> =
  NonNullable<ReturnType<typeof planPipelinedBatch<TOp>>>;

/**
 * The URL and body of a pipelined batch: `?batch=2`, with its `pipe` in the
 * body of a POST, beside the inputs, and in a search param of a GET, which
 * has no body. A server that doesn't accept pipelined batches runs none of it.
 */
export function pipelinedRequest(
  reads: PipelineReads,
): Pick<ContentOptions, 'getUrl' | 'getBody'> {
  return {
    getUrl: (opts) => {
      const url = getUrl(opts).replace(/([?&])batch=1(?=&|$)/, '$1batch=2');
      return opts.methodOverride === 'POST'
        ? url
        : `${url}&pipe=${encodeURIComponent(JSON.stringify(reads))}`;
    },
    getBody: (opts) => {
      const body = getBody(opts);
      return typeof body === 'string' && opts.methodOverride === 'POST'
        ? JSON.stringify({ ...JSON.parse(body), pipe: reads })
        : body;
    },
  };
}

/**
 * What a server that doesn't accept pipelined batches answers one with. It
 * takes the batch for a call to one procedure, and finds none.
 */
export function assertPipelinedBatchAccepted(opts: {
  json: unknown;
  /** The link's transformer for what the server sends */
  deserialize: (error: unknown) => unknown;
}) {
  const { json } = opts;
  const shape = Array.isArray(json)
    ? undefined
    : (json as { error?: unknown } | null)?.error;
  const error =
    shape === undefined
      ? undefined
      : (opts.deserialize(shape) as {
          message?: unknown;
          data?: { code?: unknown };
        } | null);
  if (
    error &&
    (error.data?.code === 'NOT_FOUND' ||
      String(error.message).includes('Streaming requests must be batched'))
  ) {
    throw new Error(
      'The server did not accept a pipelined batch. Set `experimental_allowPipelining: true` on its handler, or turn off `experimental_pipelining` on the link',
    );
  }
}

/**
 * Gives every operation of a batch its result, from the results of the ones that
 * were sent. Marks an operation that didn't run as `unresolved`.
 */
export function resultsOfPipelinedBatch<
  TOp extends Pick<Operation, 'context'>,
  TResult extends { json: object },
>(opts: {
  batchOps: readonly TOp[];
  plan: PipelinedBatchPlan<TOp>;
  /** The result of each sent operation */
  results: readonly (TResult | Promise<TResult>)[];
}): Promise<TResult>[] {
  const results = opts.results.map((result) => Promise.resolve(result));
  return opts.batchOps.map(async (op, index) => {
    const pipeline = pipelineOf(op);
    const position = opts.plan.positions[index];
    const result = position == null ? undefined : results[position];
    if (!result) {
      if (pipeline) {
        pipeline.unresolved = true;
      }
      throw new Error(
        'The operation this operation reads its input from is not in its batch',
      );
    }
    for (const read of pipeline?.reads ?? []) {
      const from =
        opts.plan.positions[
          opts.batchOps.findIndex((other) => pipelineOf(other) === read.from)
        ];
      const failed =
        from == null ||
        (await Promise.resolve(results[from]).then(
          (source) => !source || 'error' in source.json,
          () => true,
        ));
      if (pipeline && failed) {
        pipeline.unresolved = true;
      }
    }
    return result;
  });
}
