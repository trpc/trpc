import { createSerializer } from '@trpc12/trpc/transformer';

/**
 * danSON, on the handler and the link: plain JSON can't carry a `File` in
 * an input.
 */
export const serializer = createSerializer();
