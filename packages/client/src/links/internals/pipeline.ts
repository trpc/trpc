import type {
  PipelinePath,
  PipelineReads,
} from '@trpc/server/unstable-core-do-not-import';
import type { Operation, OperationContext } from '../types';

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
 * Decides which operations of a batch to send. One that reads from an operation
 * outside the batch can't run, so it isn't sent.
 */
export function planPipelinedBatch<TOp extends Pick<Operation, 'context'>>(
  batchOps: readonly TOp[],
) {
  const sent: TOp[] = [];
  const reads: PipelineReads = {};
  const sentIndexes = new Map<OperationPipeline, number>();
  /** The index in `sent` of each operation, or `null` if it isn't sent */
  const positions = batchOps.map((op) => {
    const pipeline = pipelineOf(op);
    const opReads = [];
    for (const read of pipeline?.reads ?? []) {
      const from = sentIndexes.get(read.from);
      if (from === undefined) {
        return null;
      }
      opReads.push({ to: read.to, from, path: read.path });
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
  return {
    sent,
    positions,
    /** The `pipe` search param, if any operation reads from another */
    pipe: Object.keys(reads).length > 0 ? JSON.stringify(reads) : null,
  };
}

/** Adds the `pipe` search param of a pipelined batch to the link's URL */
export function withPipeParam(url: string, pipe: string | null) {
  if (pipe === null) {
    return url;
  }
  return `${url}${url.includes('?') ? '&' : '?'}pipe=${encodeURIComponent(pipe)}`;
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
  plan: ReturnType<typeof planPipelinedBatch<TOp>>;
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
