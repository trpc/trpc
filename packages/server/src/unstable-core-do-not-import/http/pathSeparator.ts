/**
 * The character between a procedure path's segments in HTTP URLs, such as
 * the `/` in `/trpc/post/byId`. Procedure paths stay dotted everywhere else:
 * in middlewares, errors, `onError` and query keys.
 *
 * `,` separates batched calls, and the other URL-reserved characters would
 * need encoding, so only these are allowed.
 */
export type PathSeparator = '.' | '/' | '_' | '~';

const pathSeparators: readonly PathSeparator[] = ['.', '/', '_', '~'];

/**
 * Throws if `value` isn't a {@link PathSeparator}, for callers without types.
 * @internal
 */
export function assertPathSeparator(
  value: unknown,
): asserts value is PathSeparator {
  if (!pathSeparators.includes(value as PathSeparator)) {
    throw new Error(
      `Invalid pathSeparator ${JSON.stringify(value)}. Use one of: ${pathSeparators.map((s) => JSON.stringify(s)).join(', ')}`,
    );
  }
}

/**
 * `post.byId` → `post/byId`, for building URLs.
 * @internal
 */
export function procedurePathToURLPath(
  path: string,
  separator: PathSeparator | undefined,
): string {
  if (!separator || separator === '.') {
    return path;
  }
  return path.split('.').join(separator);
}

/**
 * `post/byId` → `post.byId`, for reading URLs. Dotted paths still resolve,
 * so clients can move to the separator after the server does.
 * @internal
 */
export function urlPathToProcedurePath(
  path: string,
  separator: PathSeparator | undefined,
): string {
  if (!separator || separator === '.') {
    return path;
  }
  return path.split(separator).join('.');
}
