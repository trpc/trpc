import { createSerializer } from '@trpc12/trpc/serializer';

/**
 * danSON, on the handler and the link: plain JSON can't carry a `File` in
 * an input.
 */
export const serializer = createSerializer();
