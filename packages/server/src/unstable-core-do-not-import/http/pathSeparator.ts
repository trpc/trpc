/**
 * The character between a procedure path's segments in HTTP URLs, such as
 * the `~` in `/trpc/post~byId`. Procedure paths stay dotted everywhere else:
 * in middlewares, errors, `onError` and query keys.
 *
 * These are the URL "unreserved" punctuation characters (RFC 3986), which
 * are never percent-encoded or normalised and mean nothing to routers. `/`
 * would need catch-all routes in every adapter, and `,` separates batched
 * calls.
 */
export type PathSeparator = '.' | '_' | '~' | '-';

/**
 * Applies the `'.'` default to a user-given `pathSeparator` option. Call it
 * once, where the option is read.
 * @internal
 */
export function resolvePathSeparator(
  value: PathSeparator | undefined,
): PathSeparator {
  return value ?? '.';
}

/**
 * `post.byId` → `post~byId`, for building URLs.
 * @internal
 */
export function procedurePathToURLPath(
  path: string,
  separator: PathSeparator,
): string {
  if (separator === '.') {
    return path;
  }
  return path.split('.').join(separator);
}

/**
 * `post~byId` → `post.byId`, for reading URLs. Dotted paths still resolve,
 * so clients can move to the separator after the server does.
 * @internal
 */
export function urlPathToProcedurePath(
  path: string,
  separator: PathSeparator,
): string {
  if (separator === '.') {
    return path;
  }
  return path.split(separator).join('.');
}
