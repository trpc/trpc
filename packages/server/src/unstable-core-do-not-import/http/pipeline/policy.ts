import { TRPCError } from '../../error/TRPCError';
import type { TRPCRequestInfo } from '../types';
import { pipelineBudgetDefaults } from './wire';

/**
 * What the server is about to do for a pipelined batch, for the policy of
 * `experimental_allowPipelining` to allow or refuse. Each comes before the
 * work it is about.
 *
 * Experimental: it may change in a minor release.
 * @see https://trpc.io/docs/client/vanilla/nested-queries#limits
 */
export type experimental_PipelineEvent =
  /**
   * A call that reads other calls' data, before it reads any. `depth` is its
   * place in its chain of reads: a call that reads one that reads none is 2.
   * `reads` is how many values it reads into its input
   */
  | { kind: 'call'; path: string; depth: number; reads: number }
  /**
   * A list that a call for every item runs for, before any of its items
   * run. Its runs count towards `maxBatchSize` as well
   */
  | { kind: 'list'; length: number }
  /**
   * A value a call reads, before it is written into an input. `whole` is
   * whether it is an object or an array. `length` is how long it is in
   * characters of JSON: `"abc"` is 5. It is measured when you read it, so a
   * policy that refuses a value without reading it measures nothing
   */
  | { kind: 'value'; whole: boolean; readonly length: number }
  /**
   * A run of a call, its input filled in, before its procedure runs.
   * `filled` is how many characters of JSON the server wrote into its input:
   * the values it reads for a call that runs once, all of its input for a
   * call for every item, as each run's input is a copy
   */
  | { kind: 'run'; path: string; filled: number };

/**
 * What a policy says of an event: `true` allows it. A reason refuses it:
 * name it so you can count refusals by it, such as `'maxDepth'`.
 *
 * Experimental: it may change in a minor release.
 */
export type experimental_PipelineVerdict =
  | true
  | { reason: string; message?: string };

/**
 * The value of `experimental_allowPipelining` that decides what a pipelined
 * batch can make the server do. It is called once for each pipelined batch,
 * after `createContext`, and returns what is called for each event of that
 * batch: keep what you count of a batch between the two.
 *
 * A call refused before any of its runs ran, for an event of it or of what
 * it reads, is asked for by the client in a request of its own. A refused run
 * fails by itself. Either way, the error is an
 * `experimental_TRPCPipelineRefusal` with your reason, which `onError` gets.
 *
 * Experimental: it may change in a minor release.
 * @see https://trpc.io/docs/client/vanilla/nested-queries#limits
 * @example
 * ```ts
 * experimental_allowPipelining: (opts) => {
 *   const budget = experimental_pipelineBudget()(opts);
 *   return (event) => {
 *     if (event.kind === 'call' && event.path.startsWith('admin.')) {
 *       return { reason: 'admin' };
 *     }
 *     return budget(event);
 *   };
 * },
 * ```
 */
export type experimental_PipelinePolicy<TContext = any> = (opts: {
  info: TRPCRequestInfo;
  /** `undefined` if `createContext` threw */
  ctx: TContext | undefined;
}) => (event: experimental_PipelineEvent) => experimental_PipelineVerdict;

/**
 * The limits of `experimental_pipelineBudget()`. Any you leave out keep their
 * default. The number of runs is `maxBatchSize`, set on the handler.
 *
 * Experimental: it may change in a minor release.
 * @see https://trpc.io/docs/client/vanilla/nested-queries#limits
 */
export interface experimental_PipelineBudgetOptions {
  /**
   * The longest value a call can read, in characters of JSON: `"abc"` is 5.
   * @default 1024
   */
  maxValueLength?: number;
  /**
   * The most values one call can read. The link plans with the default, so
   * it never sends a call with more.
   * @default 16
   */
  maxReadsPerCall?: number;
  /**
   * The most a batch can fill in, in characters of JSON: every value written
   * into an input, and the whole input of every run of a call for every item.
   * @default 100_000
   */
  maxFillSize?: number;
  /**
   * The most calls in a chain: a query that reads none is 1, so
   * `post.bySlug` → `author.byId` → `post.list` is 3. The link plans with
   * the default, so it never sends a call deeper than that.
   * @default 3
   */
  maxDepth?: number;
  /**
   * Whether a value a call reads can be an object or an array. Without it, a
   * value has to be a string, a number, a boolean or `null`.
   * @default false
   */
  allowWholeValues?: boolean;
}

/**
 * The policy of `experimental_allowPipelining: true`: limits that keep what a
 * small request can make the server do in proportion to it. Pass it limits
 * to change some, or call it in a policy of your own to refuse more.
 *
 * Experimental: it may change in a minor release.
 * @see https://trpc.io/docs/client/vanilla/nested-queries#limits
 * @example
 * ```ts
 * experimental_allowPipelining: experimental_pipelineBudget({ allowWholeValues: true }),
 * ```
 */
export function experimental_pipelineBudget(
  opts?: experimental_PipelineBudgetOptions,
): experimental_PipelinePolicy {
  const limits = { ...pipelineBudgetDefaults, ...opts };
  return () => {
    let filled = 0;
    return (event) => {
      switch (event.kind) {
        case 'call':
          if (event.reads > limits.maxReadsPerCall) {
            return {
              reason: 'maxReadsPerCall',
              message: `This call reads ${event.reads} values, more than \`maxReadsPerCall\` (${limits.maxReadsPerCall}) allows`,
            };
          }
          if (event.depth > limits.maxDepth) {
            return {
              reason: 'maxDepth',
              message: `This call is ${event.depth} calls deep in a chain, more than \`maxDepth\` (${limits.maxDepth}) allows`,
            };
          }
          return true;
        case 'list':
          return true;
        case 'value':
          if (event.whole && !limits.allowWholeValues) {
            return {
              reason: 'allowWholeValues',
              message: `A value this call reads is an object or an array, and \`allowWholeValues\` is false`,
            };
          }
          if (event.length > limits.maxValueLength) {
            return {
              reason: 'maxValueLength',
              message: `A value this call reads is longer than \`maxValueLength\` (${limits.maxValueLength} characters of JSON) allows`,
            };
          }
          return true;
        case 'run':
          if (filled + event.filled > limits.maxFillSize) {
            return {
              reason: 'maxFillSize',
              message: `What this call fills in goes over \`maxFillSize\` (${limits.maxFillSize} characters of JSON for the batch)`,
            };
          }
          filled += event.filled;
          return true;
      }
    };
  };
}

/**
 * The error of a call or a run the server refused to fill in, for its
 * policy, its `maxBatchSize`, or an input it can't fill in as the client
 * would send it. `reason` says which: the policy's own, `'maxBatchSize'`, or
 * `'transformer'`. `onError` gets it, with the call's path.
 *
 * Experimental: it may change in a minor release.
 * @see https://trpc.io/docs/client/vanilla/nested-queries#limits
 * @example
 * ```ts
 * onError({ error, path }) {
 *   if (error instanceof experimental_TRPCPipelineRefusal) {
 *     metrics.increment('pipeline.refused', { reason: error.reason, path });
 *   }
 * },
 * ```
 */
export class experimental_TRPCPipelineRefusal extends TRPCError {
  /** Why it was refused, such as `'maxDepth'` */
  public readonly reason: string;

  constructor(opts: { reason: string; message?: string }) {
    super({
      code: 'BAD_REQUEST',
      message:
        opts.message ??
        `Refused by \`experimental_allowPipelining\`: ${opts.reason}`,
    });
    this.reason = opts.reason;
  }
}
