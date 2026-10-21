import { experimental_createProgressiveJson } from '@trpc12/trpc/transformer';

/**
 * Progressive JSON, on the handler and the link: plain JSON can't carry a `File` in
 * an input.
 */
export const transformer = experimental_createProgressiveJson();
