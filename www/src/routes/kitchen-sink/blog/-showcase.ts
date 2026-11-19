import { showcases } from '../-showcases.ts';

const found = showcases.find((it) => it.path === '/kitchen-sink/blog');
if (found === undefined) {
  throw new Error('The blog showcase is missing from `-showcases.ts`');
}

/** The blog's entry in the kitchen sink: its title and description */
export const showcase = found;
