import { experimental_createTransformer } from '@trpc12/trpc/transformer';

/**
 * danSON, on the handler and the link: plain JSON can't carry a `File` in
 * an input.
 */
export const transformer = experimental_createTransformer();
