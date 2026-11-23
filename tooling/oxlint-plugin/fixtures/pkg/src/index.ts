export { reached, type Reached } from './reached';
export * as ns from './ns';

/** Text that looks like an export isn't one. */
export const example = "export { NotReached } from './reached';";
