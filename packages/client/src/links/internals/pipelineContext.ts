import { isObject } from '@trpc/server/unstable-core-do-not-import';
import type { Operation, OperationContext } from '../types';
import type { OperationPipeline } from './pipeline';

/**
 * Where an operation's pipeline is in its context. Apart from the pipelining
 * code, so that a link that only reads the pipeline, such as `loggerLink`,
 * doesn't bring that code into a bundle.
 */
const contextKey = '~pipeline';

/** The context to send an operation with, for it to take part in pipelining */
export function pipelineContext(pipeline: OperationPipeline): OperationContext {
  return { [contextKey]: pipeline };
}

/** Anything can be in a context: this is one only if it has what a link uses */
function isOperationPipeline(value: unknown): value is OperationPipeline {
  return (
    isObject(value) &&
    typeof value['open'] === 'boolean' &&
    Array.isArray(value['calls']) &&
    value['sent'] instanceof Promise &&
    typeof value['settleSent'] === 'function'
  );
}

/** The operation's pipeline, if its context has one */
export function pipelineOf(
  op: Pick<Operation, 'context'>,
): OperationPipeline | null {
  const pipeline = op.context[contextKey];
  return isOperationPipeline(pipeline) ? pipeline : null;
}
