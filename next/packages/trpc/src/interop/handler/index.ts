/**
 * The v11 handler: v11 clients' HTTP batches, JSONL streams and wsLink
 * sessions, answered with v11's error shapes.
 *
 * @module
 */
export {
  v11Shape,
  type V11ErrorFormatterOpts,
  type V11ErrorShape,
} from './errors.ts';
export { createV11Handler } from './handler.ts';
export type {
  BaseV11HandlerOptions,
  V11Handler,
  V11HandlerOptions,
  V11Transformer,
  V11TransformerOption,
} from './handler.ts';
