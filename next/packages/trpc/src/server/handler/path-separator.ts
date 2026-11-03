import { Effect } from 'effect';
import type { PathSeparator } from '../../internal/protocol.ts';
import {
  isLazy,
  isProcedure,
  resolveProcedure,
  type AnyProcedure,
  type AnyRouter,
} from '../procedures/index.ts';

/**
 * How a handler reads procedure paths from URLs. Paths stay dotted
 * everywhere else; only the URL joins their segments with the separator.
 * @internal
 */
export interface UrlPaths {
  /** The dotted path a URL path names. */
  readonly fromUrl: (urlPath: string) => string;
  /**
   * {@link resolveProcedure}, refusing a lazy subtree on the way whose keys
   * hold the separator, once it has loaded.
   */
  readonly resolve: (path: string) => Effect.Effect<AnyProcedure | undefined>;
}

/**
 * A key with the separator in it makes two paths share a URL
 * (`{ a: { b_c } }` and `{ a: { b: { c } } }` are both `/trpc/a_b_c` with
 * `_`), so a call could reach the other procedure. Checks the eager tree
 * and the lazy subtrees that have loaded, each once.
 */
const checkKeys = (
  node: AnyRouter,
  separator: PathSeparator,
  checked: WeakSet<object>,
  prefix: string,
): void => {
  for (const key of Object.keys(node)) {
    const path = `${prefix}${key}`;
    if (key.includes(separator)) {
      throw new Error(
        `Router key "${path}": experimental_pathSeparator ${JSON.stringify(separator)} separates path segments in URLs; rename it or pick another separator`,
      );
    }
    const child: unknown = node[key];
    if (isLazy(child)) {
      const loaded = child['~lazy'].loaded;
      if (loaded && !checked.has(child)) {
        checked.add(child);
        checkKeys(loaded, separator, checked, `${path}.`);
      }
    } else if (
      typeof child === 'object' &&
      child !== null &&
      !isProcedure(child)
    ) {
      checkKeys(child as AnyRouter, separator, checked, `${path}.`);
    }
  }
};

/** @internal */
export const makeUrlPaths = (
  router: AnyRouter,
  separator: PathSeparator,
): UrlPaths => {
  if (separator === '.') {
    return {
      fromUrl: (urlPath) => urlPath,
      resolve: (path) => resolveProcedure(router, path),
    };
  }
  const checked = new WeakSet<object>();
  checkKeys(router, separator, checked, '');
  /** The lazy subtrees on `path` that loaded since the last check. */
  const checkPath = (path: string) => {
    let node: unknown = router;
    let prefix = '';
    for (const segment of path.split('.')) {
      if (isLazy(node)) {
        const loaded = node['~lazy'].loaded;
        if (!loaded) return;
        if (!checked.has(node)) {
          checked.add(node);
          checkKeys(loaded, separator, checked, prefix);
        }
        node = loaded;
      }
      if (typeof node !== 'object' || node === null || isProcedure(node)) {
        return;
      }
      node = (node as Record<string, unknown>)[segment];
      prefix = `${prefix}${segment}.`;
    }
  };
  return {
    fromUrl: (urlPath) => urlPath.split(separator).join('.'),
    resolve: (path) =>
      Effect.tap(resolveProcedure(router, path), () =>
        Effect.sync(() => checkPath(path)),
      ),
  };
};
