// NOTE: This indirection is only needed to break a circular-reference.
// After removal of `hooks/deprecated/createHooksInternal` file,
// `hooks/createHooksInternal` can be swapped for all `createRootHooks` imports.
export { createRootHooks } from './createHooksInternal';
