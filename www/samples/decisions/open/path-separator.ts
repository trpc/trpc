/**
 * The typing `.agent-docs/open/path-separator.md` proposes for C: on the
 * client, an operation's path is a tuple of router keys rather than a
 * dotted string. A and B keep `op.path: 'post.byId' | …`, as it is.
 */

type Segments<S extends string> = S extends `${infer Head}.${infer Rest}`
  ? [Head, ...Segments<Rest>]
  : [S];

/** C: what links get as `op`, for a router with the paths `TPath`. */
export interface OperationC<TPath extends string> {
  readonly path: TPath extends string ? Readonly<Segments<TPath>> : never;
}
