/**
 * The typing `.agent-docs/open/path-separator.md` proposes for C: procedure
 * paths are tuples everywhere inside, so what middleware, `onError` and
 * `createContext`'s calls get as `path` is one too. A and B keep
 * `path: string`, as it is.
 */

/** C: a procedure's path, one entry per router key. */
export type ProcedurePathC = readonly [string, ...string[]];

/** C: the `path` a middleware reads. */
export interface MiddlewareOptsC {
  readonly path: ProcedurePathC;
}
